import { generateBunkerCondition } from '../database/bunker.js';
import { notifyExiled } from '../bot/bot.js';
import { generateRandomCharacter, getCardsBase } from '../database/cards.js';
import { getRandomEvent } from '../database/events.js';

export class GameManager {
    constructor() {
        this.rooms = new Map(); // roomId -> Room instance
    }

    createRoom(hostId) {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newRoom = new Room(roomId, hostId);
        this.rooms.set(roomId, newRoom);
        return roomId;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId.toUpperCase());
    }

    startCleanupTask(io) {
        setInterval(() => {
            const now = Date.now();
            for (const [roomId, room] of this.rooms.entries()) {
                if (room.players.length === 0 || (now - room.lastActivity > 180000)) {
                    console.log(`[Cleanup] Удаление комнаты ${roomId} по неактивности`);
                    this.rooms.delete(roomId);
                }
            }
        }, 60000);
    }

    findRoomByPlayer(playerId) {
        for (const room of this.rooms.values()) {
            if (room.players.find(p => p.id === playerId)) {
                return room;
            }
        }
        return null;
    }

    removePlayerFromAllRooms(playerId, io) {
        for (const room of this.rooms.values()) {
            const playerIndex = room.players.findIndex(p => p.id === playerId);
            if (playerIndex !== -1) {
                room.leave(playerId, io);
                if (room.players.length === 0) {
                    this.rooms.delete(room.id);
                }
            }
        }
    }
}

class Room {
    constructor(id, hostId) {
        this.id = id;
        this.hostId = hostId;
        this.players = []; 
        this.state = {
            phase: 'LOBBY', 
            round: 0,
            currentSpeakerId: null, 
            timeoutRef: null,
            votes: {}, 
            tieBreakerTargets: [], 
            bunkerCondition: null,
            resources: { food: 100, water: 100, energy: 100 },
            activeEvent: null,
            readyPlayers: new Set(),
            introTimeoutRef: null,
            hasRevealedInTurn: false,
            messages: [] 
        };
        this.lastActivity = Date.now();
    }

    updateActivity() {
        this.lastActivity = Date.now();
    }

    join(playerData) { 
        const existingPlayer = this.players.find(p => p.id === playerData.id);
        if (existingPlayer) {
            existingPlayer.socketId = playerData.socketId;
            existingPlayer.name = playerData.name;
            existingPlayer.photoUrl = playerData.photoUrl || existingPlayer.photoUrl;
            return true;
        }

        this.players.push({
            ...playerData, 
            photoUrl: playerData.photoUrl || null,
            isAlive: true,
            character: generateRandomCharacter(),
            revealedCards: [] 
        });
        return true;
    }

    leave(playerId, io) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.updateActivity();
        if (io) {
            io.to(this.id).emit('room_update', { players: this.players, resources: this.state.resources });
        }
    }

    startGame(io) {
        if (this.players.length === 0) return;
        this.state.bunkerCondition = generateBunkerCondition(this.players.length);
        this.state.resources = { food: 100, water: 100, energy: 100 };
        this.state.phase = 'BUNKER_INTRO';
        this.state.round = 1;
        this.state.readyPlayers = new Set();
        
        this.state.introTimeoutRef = setTimeout(() => {
            this.startFirstTurn(io);
        }, 60000);

        io.to(this.id).emit('game_started', { 
            bunkerCondition: this.state.bunkerCondition,
            resources: this.state.resources 
        });
    }

    playerReady(playerId, io) {
        if (this.state.phase !== 'BUNKER_INTRO') return;
        
        this.state.readyPlayers.add(playerId);
        const total = this.players.length;
        const ready = this.state.readyPlayers.size;

        io.to(this.id).emit('ready_progress', { ready, total });

        if (ready >= total) {
            if (this.state.introTimeoutRef) {
                clearTimeout(this.state.introTimeoutRef);
                this.state.introTimeoutRef = null;
            }
            this.startFirstTurn(io);
        }
    }

    startFirstTurn(io) {
        if (this.state.phase !== 'BUNKER_INTRO') return;
        this.state.phase = 'SPEAKING';
        this.startTurnForPlayer(0, io);
        io.to(this.id).emit('round_started', { round: this.state.round });
    }

    startTurnForPlayer(livingIndex, io) {
        if (this.state.timeoutRef) clearTimeout(this.state.timeoutRef);

        const livingPlayers = this.players.filter(p => p.isAlive);
        
        if (livingIndex >= livingPlayers.length) {
            if (this.state.round < 3) {
                this.state.phase = 'SPEAKING';
                this.state.round += 1;
                this.triggerConsumption(io);
                this.startTurnForPlayer(0, io);
                return;
            }

            this.state.phase = 'VOTING';
            this.state.votes = {};
            this.state.tieBreakerTargets = [];
            io.to(this.id).emit('voting_started', { 
                allowedTargets: livingPlayers.map(p => p.id) 
            });
            return;
        }

        const activePlayer = livingPlayers[livingIndex];
        this.state.currentSpeakerId = activePlayer.id;
        this.state.currentSpeakerIdx = livingIndex;
        this.state.hasRevealedInTurn = false;

        const timeLimit = 60;

        io.to(this.id).emit('turn_update', {
            activeSpeakerId: activePlayer.id,
            round: this.state.round,
            phase: this.state.phase,
            timeLimit: timeLimit,
            isTieBreaker: false
        });

        io.to(this.id).emit('room_update', { 
            players: this.players, 
            bunkerCondition: this.state.bunkerCondition,
            resources: this.state.resources,
            phase: this.state.phase,
            round: this.state.round,
            activeSpeakerId: activePlayer.id,
            messages: this.state.messages,
            hasRevealedInTurn: this.state.hasRevealedInTurn
        });

        this.state.timeoutRef = setTimeout(() => {
            this.checkForceReveal(io);
        }, timeLimit * 1000 + 1000); 
    }

    triggerConsumption(io) {
        const livingPlayersCount = this.players.filter(p => p.isAlive).length;
        const consumption = {
            food: livingPlayersCount * 2,
            water: livingPlayersCount * 3,
            energy: 5
        };
        
        this.state.resources.food = Math.max(0, this.state.resources.food - consumption.food);
        this.state.resources.water = Math.max(0, this.state.resources.water - consumption.water);
        this.state.resources.energy = Math.max(0, this.state.resources.energy - consumption.energy);
        
        io.to(this.id).emit('room_update', { resources: this.state.resources });
    }

    checkForceReveal(io) {
        if (this.state.hasRevealedInTurn) {
            this.nextTurn(io);
        } else {
            io.to(this.id).emit('force_reveal_required', { playerId: this.state.currentSpeakerId });
        }
    }

    nextTurn(io) {
        if (this.state.timeoutRef) clearTimeout(this.state.timeoutRef);
        if (this.state.phase === 'TIE_BREAKER') {
            this.startTieBreakerTurn(this.state.currentSpeakerIdx + 1, io);
        } else {
            this.startTurnForPlayer(this.state.currentSpeakerIdx + 1, io);
        }
    }

    castVote(voterId, targetId, io) {
        if (this.state.phase !== 'VOTING') return;
        const voter = this.players.find(p => p.id === voterId);
        if (!voter || !voter.isAlive) return;
        this.state.votes[voterId] = targetId;
        const livingCount = this.players.filter(p => p.isAlive).length;
        if (Object.keys(this.state.votes).length >= livingCount) {
            this.resolveVoting(io);
        }
    }

    playActionCard(playerId, cardId, targetId, io) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || !player.isAlive) return;
        if (!player.character.actionCards) return;
        const cardIndex = player.character.actionCards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return; 
        const cardDef = player.character.actionCards[cardIndex];
        const target = targetId ? this.players.find(p => p.id === targetId) : null;
        let success = true;
        const CARDS_BASE = getCardsBase();
        const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

        switch (cardId) {
            case 'heal':
                if (target) target.character.health = "Абсолютно здоров";
                else player.character.health = "Абсолютно здоров";
                break;
            case 'swap_health':
                if (target) {
                    const temp = player.character.health;
                    player.character.health = target.character.health;
                    target.character.health = temp;
                }
                break;
            case 'mute':
                if (target) target.isMuted = true;
                break;
            case 'steal_luggage':
                if (target) {
                    player.character.luggage = target.character.luggage;
                    target.character.luggage = "Пустые карманы (багаж украден)";
                }
                break;
            case 'reroll_biology':
                player.character.biology = getRandomItem(CARDS_BASE.biologies);
                break;
            case 'force_reveal':
                if (target) {
                    const allTraits = ['profession', 'biology', 'health', 'hobby', 'phobia', 'trait', 'luggage', 'fact'];
                    const unrevealed = allTraits.filter(k => !target.revealedCards.some(r => r.key === k));
                    if (unrevealed.length > 0) {
                        const randomTrait = getRandomItem(unrevealed);
                        target.revealedCards.push({ key: randomTrait, value: target.character[randomTrait] });
                        io.to(this.id).emit('card_revealed', { playerId: target.id, playerName: target.name, cardKey: randomTrait, value: target.character[randomTrait] });
                    }
                }
                break;
            case 'veto':
                this.state.votes = {};
                break;
            case 'triple_vote':
                if (target) player.tripleVoteTarget = target.id;
                break;
            case 'immunity':
                player.hasImmunity = true;
                break;
            case 'swap_votes':
                if (target) {
                    const playerVoters = Object.keys(this.state.votes).filter(k => this.state.votes[k] === player.id);
                    const targetVoters = Object.keys(this.state.votes).filter(k => this.state.votes[k] === target.id);
                    playerVoters.forEach(v => this.state.votes[v] = target.id);
                    targetVoters.forEach(v => this.state.votes[v] = player.id);
                }
                break;
            case 'double_vote':
                if (target) player.doubleVoteTarget = target.id;
                break;
            default:
                success = false;
        }

        if (success) {
            player.character.actionCards.splice(cardIndex, 1);
            io.to(this.id).emit('action_played', { 
                playerName: player.name, 
                cardTitle: cardDef.title,
                targetName: target ? target.name : null
            });
            io.to(this.id).emit('room_update', { players: this.players, resources: this.state.resources, bunkerCondition: this.state.bunkerCondition });
        }
    }

    resolveVoting(io) {
        const tally = {};
        for (const [voterId, targetId] of Object.entries(this.state.votes)) {
            const voter = this.players.find(p => p.id === voterId);
            let weight = 1;
            if (voter) {
                if (voter.tripleVoteTarget === targetId) weight = 3;
                else if (voter.doubleVoteTarget === targetId) weight = 2;
            }
            const target = this.players.find(p => p.id === targetId);
            if (target && !target.hasImmunity) {
                tally[targetId] = (tally[targetId] || 0) + weight;
            }
        }
        
        let max = 0;
        let leaders = [];
        for (const [id, count] of Object.entries(tally)) {
            if (count > max) { max = count; leaders = [id]; }
            else if (count === max) leaders.push(id);
        }

        if (leaders.length === 1) {
            const eliminatedId = leaders[0];
            const p = this.players.find(p => p.id === eliminatedId);
            if (p) {
                p.isAlive = false;
                notifyExiled(p.id, p.name);
                io.to(this.id).emit('player_eliminated', { eliminatedId, eliminatedName: p.name });
            }
            const aliveCount = this.players.filter(p => p.isAlive).length;
            if (aliveCount <= this.state.bunkerCondition.capacity) {
                this.endGame(io);
            } else {
                setTimeout(() => {
                    this.state.phase = 'SPEAKING';
                    this.state.round += 1;
                    this.triggerConsumption(io);
                    this.startTurnForPlayer(0, io);
                }, 6000);
            }
        } else if (leaders.length > 1) {
            this.state.tieBreakerTargets = leaders;
            this.state.phase = 'TIE_BREAKER';
            io.to(this.id).emit('tie_breaker_started', { tiedPlayerIds: leaders });
            setTimeout(() => this.startTieBreakerTurn(0, io), 5000);
        }
    }

    startTieBreakerTurn(index, io) {
        if (this.state.timeoutRef) clearTimeout(this.state.timeoutRef);
        if (index >= this.state.tieBreakerTargets.length) {
            this.state.phase = 'VOTING';
            io.to(this.id).emit('voting_started', { allowedTargets: this.state.tieBreakerTargets, isTieBreaker: true });
            return;
        }
        const activeId = this.state.tieBreakerTargets[index];
        this.state.currentSpeakerId = activeId;
        this.state.currentSpeakerIdx = index;
        io.to(this.id).emit('turn_update', { activeSpeakerId: activeId, round: this.state.round, timeLimit: 60, isTieBreaker: true });
        this.state.timeoutRef = setTimeout(() => this.startTieBreakerTurn(index + 1, io), 61000);
    }

    endGame(io) {
        this.state.phase = 'GAME_OVER';
        const survivors = this.players.filter(p => p.isAlive);
        
        // Кастомный расчет вероятности выживания на основе ресурсов
        let baseProb = 50 + (this.state.resources.food + this.state.resources.water + this.state.resources.energy) / 6;
        if (survivors.length > this.state.bunkerCondition.capacity) baseProb -= 20;
        
        const survivalProbability = Math.min(100, Math.max(0, Math.floor(baseProb)));
        let verdict = "Выживание обеспечено!";
        if (survivalProbability < 30) verdict = "Колония погибла через месяц.";
        else if (survivalProbability < 60) verdict = "Тяжелое выживание с большими потерями.";

        io.to(this.id).emit('game_over', { survivors, verdict, survivalProbability });
    }
}
