import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import cors from 'cors';

import { setupBot, bot } from './bot/bot.js';
import { GameManager } from './game/GameManager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import localtunnel from 'localtunnel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Раздача фронтенда (static files)
const frontendPath = path.resolve(__dirname, '../frontend/dist');
console.log('📂 Путь к фронтенду:', frontendPath);

if (process.env.NODE_ENV === 'production') {
    if (!fs.existsSync(frontendPath)) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Папка /frontend/dist не найдена!');
    } else {
        console.log('✅ Папка /frontend/dist найдена.');
    }
}

app.use(express.static(frontendPath));

app.get('*', (req, res, next) => {
    // Если это не API запрос, отдаем index.html
    if (req.path.startsWith('/api')) return next();
    
    const indexPath = path.join(frontendPath, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('❌ Ошибка отправки index.html:', err.message);
            res.status(404).send('Игра еще не собрана или путь неверный. Проверьте логи сборки.');
        }
    });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"],
        credentials: true
    }
});

const gameManager = new GameManager();

// Запуск автоматической очистки неактивных комнат
gameManager.startCleanupTask(io);

// Инициализация Telegram Бота
setupBot(gameManager);

const botToken = process.env.BOT_TOKEN;
console.log('🤖 Проверка BOT_TOKEN...');

if (botToken && botToken !== 'ТВОЙ_ТОКЕН_ИЗ_BOTFATHER') {
    console.log('🚀 Подготовка к запуску Telegram Бота...');
    
    // Удаляем вебхуки и сбрасываем очередь сообщений, чтобы бот точно начал отвечать
    bot.telegram.deleteWebhook({ drop_pending_updates: true })
        .then(() => {
            console.log('🧹 Старые вебхуки удалены, очередь очищена.');
            return bot.launch();
        })
        .then(() => console.log('✅ Telegram Bot успешно запущен и готов к работе!'))
        .catch((err) => {
            console.error('❌ Ошибка при запуске бота:', err);
            if (err.message.includes('409: Conflict')) {
                console.warn('⚠️ Конфликт: Возможно, запущена еще одна копия бота. Попробуйте остановить другие процессы.');
            }
        });
} else {
    console.log('⚠️ BOT_TOKEN не валиден в .env. Бот НЕ будет запущен.');
}

const PORT = process.env.PORT || 3000;

// Запуск настройки доступа
const setupAccess = async () => {
    // Если мы на Render, используем переменную окружения
    if (process.env.NODE_ENV === 'production') {
        const prodUrl = process.env.FRONTEND_URL;
        console.log('🌐 Режим Production. Целевой URL:', prodUrl);
        
        if (prodUrl && bot && bot.telegram) {
            bot.telegram.setChatMenuButton({
                menu_button: {
                    type: 'web_app',
                    text: 'Играть в Бункер ☢️',
                    web_app: { url: prodUrl }
                }
            }).catch(() => console.log('Не удалось обновить Menu Button в Prod (не критично)'));
        }
        return;
    }

    console.log('📡 Попытка создать публичную ссылку для Mini App (ждем ответа сервера localtunnel)...');
    try {
        const tunnel = await localtunnel({ port: PORT });
        console.log(`\n\x1b[42m\x1b[30m %s \x1b[0m`, `ГОРЯЧАЯ ССЫЛКА ДЛЯ ТЕСТИРОВАНИЯ:`);
        console.log(`\x1b[32m%s\x1b[0m\n`, tunnel.url); 
        
        process.env.FRONTEND_URL = tunnel.url;

        if (bot && bot.telegram) {
            bot.telegram.setChatMenuButton({
                menu_button: {
                    type: 'web_app',
                    text: 'Играть в Бункер ☢️',
                    web_app: { url: tunnel.url }
                }
            }).catch(() => console.log('Не удалось обновить Menu Button автоматически'));
        }

        tunnel.on('close', () => {
            console.log('🔴 Соединение localtunnel закрыто');
        });
    } catch (err) {
        console.error('Ошибка при создании localtunnel:', err);
    }
};

setupAccess();

// Простой API эндпоинт для проверки здоровья сервера
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', activeRooms: gameManager.rooms.size });
});

// Работа с Web App через WebSockets в реальном времени
const checkSubscription = async (userId) => {
    try {
        console.log(`[Subscription] Проверка пользователя ${userId} в канале @SectorX7...`);
        // Проверяем подписку на канал @SectorX7
        const member = await bot.telegram.getChatMember('@SectorX7', userId);
        const allowedStatuses = ['member', 'administrator', 'creator', 'member']; // Расширяем для надежности
        const isSubscribed = allowedStatuses.includes(member.status.toLowerCase());
        console.log(`[Subscription] Статус пользователя ${userId}: ${member.status}. Результат: ${isSubscribed}`);
        return isSubscribed;
    } catch (error) {
        console.error(`[Subscription ERROR] Ошибка проверки пользователя ${userId}:`, error.message);
        // Если бот не может проверить (например, не в канале), временно разрешаем вход, чтобы не ломать игру
        if (error.message.includes('chat not found') || error.message.includes('bot was kicked')) {
            console.warn('⚠️ Ошибка доступа к каналу. Вход разрешен временно.');
            return true;
        }
        return false;
    }
};

io.on('connection', (socket) => {
    console.log('🟢 Web App подключился:', socket.id);

    // Обработка создания новой комнаты
    socket.on('create_room', async (data, callback) => {
        const { playerId, playerName, photoUrl, isRetry } = data;
        
        const isSubscribed = await checkSubscription(playerId);
        if (!isSubscribed) {
            socket.emit('error', { 
                type: 'SUBSCRIPTION_REQUIRED', 
                message: 'Для игры необходимо подписаться на наш канал @SectorX7',
                isRetry: !!isRetry
            });
            return;
        }

        // Перед созданием новой удаляем игрока из всех старых комнат (очистка мусора)
        gameManager.removePlayerFromAllRooms(playerId, io);

        const roomId = gameManager.createRoom(playerId);
        const room = gameManager.getRoom(roomId);
        room.updateActivity(); // Обновляем активность
        
        room.join({ id: playerId, name: playerName, socketId: socket.id, photoUrl });
        socket.join(roomId);
        
        console.log(`Комната ${roomId} создана: ${playerName} (${playerId})`);
        if (callback) callback({ roomId, players: room.players });
    });

    // Обработка подключения игрока к комнате из фронтенда
    socket.on('join_room', async (data) => {
        const { roomId, playerId, playerName, photoUrl, isRetry } = data;
        
        const isSubscribed = await checkSubscription(playerId);
        if (!isSubscribed) {
            socket.emit('error', { 
                type: 'SUBSCRIPTION_REQUIRED', 
                message: 'Для игры необходимо подписаться на наш канал @SectorX7',
                isRetry: !!isRetry
            });
            return;
        }

        // Перед входом в новую удаляем игрока из всех старых комнат
        gameManager.removePlayerFromAllRooms(playerId, io);

        const room = gameManager.getRoom(roomId);
        
        if (room) {
            room.updateActivity(); // Обновляем активность
            room.join({ id: playerId, name: playerName, socketId: socket.id, photoUrl });
            socket.join(roomId);
            console.log(`Игрок ${playerName} зашел в комнату ${roomId}`);
            
            io.to(roomId).emit('room_update', { players: room.players });
        } else {
            socket.emit('error', { message: 'Комната не найдена!' });
        }
    });

    // Проверка существующей сессии (для реконнекта)
    socket.on('check_session', (data, callback) => {
        const { playerId } = data;
        const room = gameManager.findRoomByPlayer(playerId);
        
        if (room) {
            const p = room.players.find(x => x.id === playerId);
            p.socketId = socket.id; // Обновляем сокет
            socket.join(room.id);
            
            console.log(`Восстановление сессии для ${p.name} в комнате ${room.id}`);
            
            // Отправляем актуальное состояние
            socket.emit('room_update', { 
                players: room.players, 
                bunkerCondition: room.state.bunkerCondition,
                phase: room.state.phase,
                round: room.state.round,
                activeSpeakerId: room.state.currentSpeakerId,
                messages: room.state.messages,
                hasRevealedInTurn: room.state.hasRevealedInTurn
            });
            
            const clientCardsObj = {};
            for (const [key, value] of Object.entries(p.character)) {
                if (key !== 'actionCards') {
                    const isRevealed = p.revealedCards.some(rc => rc.key === key);
                    clientCardsObj[key] = { id: key, value: value, isRevealed: isRevealed };
                }
            }
            socket.emit('your_cards', { cards: clientCardsObj, actionCards: p.character.actionCards || [] });
            
            if (callback) callback({ roomId: room.id, screen: room.state.phase === 'LOBBY' ? 'LOBBY' : 'GAME' });
        } else {
            if (callback) callback(null);
        }
    });

    // Обработка старта игры
    socket.on('start_game', (data) => {
        const { roomId } = data;
        const room = gameManager.getRoom(roomId);
        if (room && room.state.phase === 'LOBBY') {
            room.startGame(io);
            
            // Рассылаем каждому Игроку его уникальные карты по его приватному сокету!
            for (const p of room.players) {
                const clientCardsObj = {};
                for (const [key, value] of Object.entries(p.character)) {
                    if (key !== 'actionCards') {
                        clientCardsObj[key] = { id: key, value: value, isRevealed: false };
                    }
                }
                io.to(p.socketId).emit('your_cards', { cards: clientCardsObj, actionCards: p.character.actionCards || [] });
            }
            console.log(`Игра в комнате ${roomId} началась! Карты розданы.`);
        }
    });

    // Обработка готовности игрока (Ready Check)
    socket.on('player_ready', (data) => {
        const { roomId, playerId } = data;
        const room = gameManager.getRoom(roomId);
        if (room) {
            room.playerReady(playerId, io);
        }
    });

    // Вскрытие карты
    socket.on('reveal_card', (data) => {
        const { roomId, playerId, cardKey } = data;
        const room = gameManager.getRoom(roomId);
        if (room) {
            room.updateActivity();
            const p = room.players.find(x => x.id === playerId);
            if (p && p.character) {
                // Прямой переход к следующему ходу если это принудительное вскрытие
                const isForcedReveal = !room.state.hasRevealedInTurn && !room.state.timeoutRef && room.state.phase === 'SPEAKING' && room.state.currentSpeakerId === playerId;

                p.revealedCards.push({
                     key: cardKey,
                     value: p.character[cardKey]
                });
                
                if (playerId === room.state.currentSpeakerId) {
                    room.state.hasRevealedInTurn = true;
                }

                io.to(roomId).emit('room_update', { players: room.players, bunkerCondition: room.state.bunkerCondition });
                
                // Эмиттим событие для Spotlight-анимации на фронтенде
                io.to(roomId).emit('card_revealed', { 
                     playerId: p.id, 
                     playerName: p.name,
                     cardKey, 
                     cardValue: p.character[cardKey]
                });

                if (isForcedReveal) {
                    console.log(`[Room ${roomId}] Вскрытие после таймера - переход хода.`);
                    room.nextTurn(io);
                }
            }
        }
    });

    // Завершение хода игроком (авто досрочно)
    socket.on('end_turn', (data) => {
        const { roomId, playerId } = data;
        const room = gameManager.getRoom(roomId);
        if (room && room.state.currentSpeakerId === playerId) {
            console.log(`Игрок ${playerId} досрочно завершил ход.`);
            room.nextTurn(io);
        }
    });

    // Голосование
    socket.on('cast_vote', (data) => {
        const { roomId, playerId, targetId } = data;
        const room = gameManager.getRoom(roomId);
        if (room) {
            room.castVote(playerId, targetId, io);
        }
    });

    // Отправка речи
    socket.on('send_speech', (data) => {
        const { roomId, playerId, text } = data;
        const room = gameManager.getRoom(roomId);
        if (room) {
            room.updateActivity();
            const speaker = room.players.find(p => p.id === playerId);
            if (speaker) {
                const message = {
                    senderName: speaker.name,
                    senderId: speaker.id,
                    text: text,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
                room.state.messages.push(message);
                
                io.to(roomId).emit('room_update', { 
                    players: room.players,
                    messages: room.state.messages,
                    bunkerCondition: room.state.bunkerCondition,
                    phase: room.state.phase,
                    round: room.state.round,
                    activeSpeakerId: room.state.currentSpeakerId,
                    hasRevealedInTurn: room.state.hasRevealedInTurn
                });
            }
        }
    });

    // Розыгрыш карты действий (Спецусловия)
    socket.on('play_action_card', (data) => {
        const { roomId, playerId, cardId, targetId } = data;
        const room = gameManager.getRoom(roomId);
        if (room) {
            room.playActionCard(playerId, cardId, targetId, io);
        }
    });

    // Новая механика: Отправка речи внутри Mini App
    socket.on('send_speech', (data) => {
        const { roomId, playerId, text } = data;
        const room = gameManager.getRoom(roomId);
        if (room && room.state.currentSpeakerId === playerId) {
            const speaker = room.players.find(p => p.id === playerId);
            io.to(roomId).emit('speech_received', { 
                playerId, 
                playerName: speaker ? speaker.name : 'Аноним', 
                text 
            });
        }
    });

    // Изменение никнейма в лобби
    socket.on('change_nickname', (data) => {
        const { roomId, playerId, newName } = data;
        const room = gameManager.getRoom(roomId);
        if (room && room.state.phase === 'LOBBY') {
            const player = room.players.find(p => p.id === playerId);
            if (player) {
                console.log(`Игрок ${player.name} сменил ник на ${newName}`);
                player.name = newName;
                io.to(roomId).emit('room_update', { players: room.players });
            }
        }
    });

    // Выход из комнаты
    socket.on('leave_room', (data) => {
        const { playerId } = data;
        gameManager.removePlayerFromAllRooms(playerId, io);
    });

    socket.on('disconnect', () => {
        console.log('🔴 Клиент отключился:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Базовый Backend-сервер запущен на порту ${PORT}`);
});

// Корректно завершаем работу бота при остановке сервера
process.once('SIGINT', () => { if (bot && typeof bot.stop === 'function') bot.stop('SIGINT'); });
process.once('SIGTERM', () => { if (bot && typeof bot.stop === 'function') bot.stop('SIGTERM'); });
