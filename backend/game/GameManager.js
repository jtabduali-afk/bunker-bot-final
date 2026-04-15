import { generateBunkerCondition } from '../database/bunker.js';
import { notifyExiled } from '../bot/bot.js';
import { generateRandomCharacter, getCardsBase } from '../database/cards.js';

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
            votes: {}, // { voterId: targetId }
            tieBreakerTargets: [], // [id1, id2]
            bunkerCondition: null,
            readyPlayers: new Set(),
            introTimeoutRef: null,
            hasRevealedInTurn: false
        };
    }

    join(playerData) { 
        if (!this.players.find(p => p.id === playerData.id)) {
            this.players.push({
                ...playerData, // Includes id, name, socketId, photoUrl
                photoUrl: playerData.photoUrl || null,
                isAlive: true,
                character: generateRandomCharacter(),
                revealedCards: [] 
            });
            return true;
        }
        return false;
    }

    startGame(io) {
        if (this.players.length === 0) return;
        this.state.bunkerCondition = generateBunkerCondition(this.players.length);
        this.state.phase = 'BUNKER_INTRO';
        this.state.round = 1;
        this.state.readyPlayers = new Set();
        
        // Авто-старт через 60 секунд, если не все нажали готов
        this.state.introTimeoutRef = setTimeout(() => {
            console.log(`[Room ${this.id}] Авто-старт по таймеру (не все нажали готов)`);
            this.startFirstTurn(io);
        }, 60000);

        io.to(this.id).emit('game_started', { bunkerCondition: this.state.bunkerCondition });
    }

    playerReady(playerId, io) {
        if (this.state.phase !== 'BUNKER_INTRO') return;
        
        this.state.readyPlayers.add(playerId);
        const total = this.players.length;
        const ready = this.state.readyPlayers.size;

        // Оповещаем всех о прогрессе готовности
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
        // Дополнительное событие, чтобы фронтенд закрыл модалки
        io.to(this.id).emit('round_started', { round: this.state.round });
    }

    startTurnForPlayer(livingIndex, io) {
        if (this.state.timeoutRef) clearTimeout(this.state.timeoutRef);

        const livingPlayers = this.players.filter(p => p.isAlive);
        
        if (livingIndex >= livingPlayers.length) {
            // В первых двух раундах голосования нет
            if (this.state.round < 3) {
                this.state.phase = 'SPEAKING';
                this.state.round += 1;
                this.startTurnForPlayer(0, io);
                return;
            }

            // Начиная с 3 раунда, после круга речей идет ГОЛОСОВАНИЕ
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
        this.state.currentSpeakerIdx = livingIndex; // Индекс в массиве живых
        this.state.hasRevealedInTurn = false;

        const timeLimit = 60; // Всегда 60 секунд

        io.to(this.id).emit('turn_update', {
            activeSpeakerId: activePlayer.id,
            round: this.state.round,
            timeLimit: timeLimit,
            isTieBreaker: false
        });

        console.log(`Ход ${activePlayer.name} (Раунд ${this.state.round})`);

        this.state.timeoutRef = setTimeout(() => {
            this.checkForceReveal(io);
        }, timeLimit * 1000 + 1000); 
    }

    checkForceReveal(io) {
        if (this.state.hasRevealedInTurn) {
            this.nextTurn(io);
        } else {
            // Игрок не вскрыл карту - отправляем сигнал блокировки
            io.to(this.id).emit('force_reveal_required', { playerId: this.state.currentSpeakerId });
            console.log(`[Room ${this.id}] Игрок ${this.state.currentSpeakerId} обязан вскрыть карту!`);
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
        
        // Проверяем, проголосовали ли все живые
        const livingCount = this.players.filter(p => p.isAlive).length;
        io.to(this.id).emit('voting_progress', { count: Object.keys(this.state.votes).length, total: livingCount });

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
            case 'reroll_prof':
                player.character.profession = getRandomItem(CARDS_BASE.professions);
                break;
            case 'triple_vote':
                if (target) {
                    player.tripleVoteTarget = target.id;
                }
                break;
            case 'reveal_fact':
                if (target && !target.revealedCards.some(r => r.key === 'fact')) {
                    target.revealedCards.push({ key: 'fact', value: target.character.fact });
                    io.to(this.id).emit('card_revealed', { playerId: target.id, playerName: target.name, cardKey: 'fact', value: target.character.fact });
                }
                break;
            case 'swap_hobby':
                if (target) {
                    const temp = player.character.hobby;
                    player.character.hobby = target.character.hobby;
                    target.character.hobby = temp;
                }
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
            case 'reveal_trait':
                if (target && !target.revealedCards.some(r => r.key === 'trait')) {
                    target.revealedCards.push({ key: 'trait', value: target.character.trait });
                    io.to(this.id).emit('card_revealed', { playerId: target.id, playerName: target.name, cardKey: 'trait', value: target.character.trait });
                }
                break;
            case 'amnesty':
                if (target) {
                    Object.keys(this.state.votes).forEach(voterId => {
                        if (this.state.votes[voterId] === target.id) delete this.state.votes[voterId];
                    });
                }
                break;
            case 'swap_phobia':
                if (target) {
                    const temp = player.character.phobia;
                    player.character.phobia = target.character.phobia;
                    target.character.phobia = temp;
                }
                break;
            case 'lucky':
                player.character.phobia = getRandomItem(CARDS_BASE.phobias);
                player.character.luggage = getRandomItem(CARDS_BASE.luggages);
                break;
            case 'heal_phobia':
                if (target) target.character.phobia = "Абсолютно ничего не боится (полное излечение).";
                else player.character.phobia = "Абсолютно ничего не боится (полное излечение).";
                break;
            case 'reroll_fact':
                if (target) target.character.fact = getRandomItem(CARDS_BASE.additional_facts);
                else player.character.fact = getRandomItem(CARDS_BASE.additional_facts);
                break;
            case 'swap_prof':
                if (target) {
                    const temp = player.character.profession;
                    player.character.profession = target.character.profession;
                    target.character.profession = temp;
                }
                break;
            case 'reveal_hobby':
                if (target && !target.revealedCards.some(r => r.key === 'hobby')) {
                    target.revealedCards.push({ key: 'hobby', value: target.character.hobby });
                    io.to(this.id).emit('card_revealed', { playerId: target.id, playerName: target.name, cardKey: 'hobby', value: target.character.hobby });
                }
                break;
            case 'reveal_prof':
                if (target && !target.revealedCards.some(r => r.key === 'profession')) {
                    target.revealedCards.push({ key: 'profession', value: target.character.profession });
                    io.to(this.id).emit('card_revealed', { playerId: target.id, playerName: target.name, cardKey: 'profession', value: target.character.profession });
                }
                break;
            case 'double_vote':
                if (target) {
                    player.doubleVoteTarget = target.id;
                }
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
            io.to(this.id).emit('room_update', { players: this.players, bunkerCondition: this.state.bunkerCondition });
            
            const reEmitCards = (p) => {
                const cObj = {};
                for (const [key, value] of Object.entries(p.character)) {
                    if (key !== 'actionCards') {
                        cObj[key] = { id: key, value: value, isRevealed: p.revealedCards.some(r => r.key === key) };
                    }
                }
                io.to(p.socketId).emit('your_cards', { cards: cObj, actionCards: p.character.actionCards || [] });
            };
            reEmitCards(player);
            if (target && target.id !== player.id) reEmitCards(target);
        }
    }

    resolveVoting(io) {
        const tally = {};
        for (const [voterId, targetId] of Object.entries(this.state.votes)) {
            // Apply double/triple vote logic
            const voter = this.players.find(p => p.id === voterId);
            let voteWeight = 1;
            if (voter) {
                if (voter.tripleVoteTarget === targetId) {
                    voteWeight = 3;
                } else if (voter.doubleVoteTarget === targetId) {
                    voteWeight = 2;
                }
            }
            // Check immunity
            const targetPlayer = this.players.find(p => p.id === targetId);
            if (targetPlayer && targetPlayer.hasImmunity) {
                continue; // Can't vote for them
            }

            tally[targetId] = (tally[targetId] || 0) + voteWeight;
        }
        
        let maxVotes = 0;
        let leaders = [];
        for (const [targetId, votes] of Object.entries(tally)) {
            if (votes > maxVotes) {
                maxVotes = votes;
                leaders = [targetId];
            } else if (votes === maxVotes) {
                leaders.push(targetId);
            }
        }

        if (leaders.length === 1) {
            // Один очевидный изгнанник
            const eliminatedId = leaders[0];
            const eliminatedPlayer = this.players.find(p => p.id === eliminatedId);
            if (eliminatedPlayer) {
                eliminatedPlayer.isAlive = false;
                notifyExiled(eliminatedPlayer.id, eliminatedPlayer.name);
            }
            
            this.state.tieBreakerTargets = [];
            this.state.votes = {};
            
            io.to(this.id).emit('player_eliminated', { eliminatedId, eliminatedName: eliminatedPlayer ? eliminatedPlayer.name : '' });
            io.to(this.id).emit('room_update', { players: this.players, bunkerCondition: this.state.bunkerCondition }); 
            
            // Проверка на КОНЕЦ ИГРЫ
            const aliveCount = this.players.filter(p => p.isAlive).length;
            if (aliveCount <= this.state.bunkerCondition.capacity) {
                this.state.phase = 'GAME_OVER';
                const survivors = this.players.filter(p => p.isAlive);
                const colonyVerdicts = [
                    { score: 10, text: "Колония обречена! Слишком слабая генетика и навыки, запасы иссякли за год." },
                    { score: 35, text: "Трудное выживание. Человечество возродится, но выжившие сильно мутировали." },
                    { score: 95, text: "Золотой век! Идеальный баланс привел к созданию настоящей подземной утопии." },
                    { score: 25, text: "Выжили, но сошли с ума от изоляции. Теперь в бункере процветает культ Консервной Банки." },
                    { score: 5, text: "Продержались пару лет. Потом кто-то случайно перерезал синий провод вместо красного..." },
                    { score: 75, text: "Успешное выживание! Возрождение цивилизации идет полным ходом, хоть и с трудом." },
                    { score: 55, text: "Средненько. Никто не умер от голода, но жизнь в бункере стала серой рутиной." }
                ];
                const verdictObj = colonyVerdicts[Math.floor(Math.random() * colonyVerdicts.length)];
                
                let survivalProbability = verdictObj.score + Math.floor(Math.random() * 11) - 5;
                if (survivalProbability < 0) survivalProbability = 0;
                if (survivalProbability > 100) survivalProbability = 100;
                
                setTimeout(() => {
                    io.to(this.id).emit('game_over', { survivors, verdict: verdictObj.text, survivalProbability });
                }, 6000);
                return;
            }
            
            // Начинаем следующий раунд через 5 секунд кровавого экрана
            setTimeout(() => {
                this.state.phase = 'SPEAKING';
                this.state.round += 1;
                this.startTurnForPlayer(0, io);
            }, 6000);

        } else if (leaders.length > 1) {
            // НИЧЬЯ. Переходим к защитным речам номинантов.
            this.state.tieBreakerTargets = leaders;
            this.state.votes = {};
            this.state.phase = 'TIE_BREAKER';
            
            io.to(this.id).emit('tie_breaker_started', { tiedPlayerIds: leaders });
            
            setTimeout(() => {
                this.startTieBreakerTurn(0, io);
            }, 5000);
        }
    }

    startTieBreakerTurn(index, io) {
        if (this.state.timeoutRef) clearTimeout(this.state.timeoutRef);

        if (index >= this.state.tieBreakerTargets.length) {
            // Оба высказались, запускаем переголосование ТОЛЬКО за них
            this.state.phase = 'VOTING';
            this.state.votes = {};
            io.to(this.id).emit('voting_started', { 
                allowedTargets: this.state.tieBreakerTargets,
                isTieBreaker: true
            });
            return;
        }

        const activePlayerId = this.state.tieBreakerTargets[index];
        const pInfo = this.players.find(p => p.id === activePlayerId);
        if (!pInfo || !pInfo.isAlive) {
            this.startTieBreakerTurn(index + 1, io); // пропустить ошибки
            return;
        }

        this.state.currentSpeakerId = activePlayerId;
        this.state.currentSpeakerIdx = index;
        const timeLimit = 60; // 1 минута на оправдание

        io.to(this.id).emit('turn_update', {
            activeSpeakerId: activePlayerId,
            round: this.state.round,
            timeLimit: timeLimit,
            isTieBreaker: true
        });

        this.state.timeoutRef = setTimeout(() => {
            this.startTieBreakerTurn(index + 1, io);
        }, timeLimit * 1000 + 1000);
    }
}
