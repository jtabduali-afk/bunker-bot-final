import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import cors from 'cors';

import { setupBot, bot } from './bot/bot.js';
import { GameManager } from './game/GameManager.js';
import path from 'path';
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
        origin: '*', // Разрешаем подключение Web App с любого адреса
        methods: ["GET", "POST"]
    }
});

const gameManager = new GameManager();

// Инициализация Telegram Бота
setupBot(gameManager);

const botToken = process.env.BOT_TOKEN;
if (botToken && botToken !== 'ТВОЙ_ТОКЕН_ИЗ_BOTFATHER') {
    bot.launch()
       .then(() => console.log('✅ Telegram Bot успешно запущен!'))
       .catch((err) => console.error('Ошибка запуска бота:', err));
} else {
    console.log('⚠️ Бот не запущен, так как нет правильного BOT_TOKEN в .env');
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
io.on('connection', (socket) => {
    console.log('🟢 Web App подключился:', socket.id);

    // Обработка создания новой комнаты
    socket.on('create_room', (data, callback) => {
        const { playerId, playerName } = data;
        const roomId = gameManager.createRoom(playerId);
        const room = gameManager.getRoom(roomId);
        
        // Создатель заходит первым
        room.join({ id: playerId, name: playerName, socketId: socket.id });
        socket.join(roomId);
        
        console.log(`Комната ${roomId} создана: ${playerName} (${playerId})`);
        if (callback) callback({ roomId, players: room.players });
    });

    // Обработка подключения игрока к комнате из фронтенда
    socket.on('join_room', (data) => {
        const { roomId, playerId, playerName } = data;
        const room = gameManager.getRoom(roomId);
        
        if (room) {
            room.join({ id: playerId, name: playerName, socketId: socket.id });
            socket.join(roomId); // Добавляем сокет в комнату socket.io
            console.log(`Игрок ${playerName} зашел в комнату ${roomId}`);
            
            // Рассылаем всем в комнате актуальный список игроков
            io.to(roomId).emit('room_update', { players: room.players });
        } else {
            socket.emit('error', { message: 'Комната не найдена!' });
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

    // Вскрытие карты
    socket.on('reveal_card', (data) => {
        const { roomId, playerId, cardKey } = data;
        const room = gameManager.getRoom(roomId);
        if (room) {
            const p = room.players.find(x => x.id === playerId);
            if (p && p.character) {
                p.revealedCards.push({
                     key: cardKey,
                     value: p.character[cardKey]
                });
                io.to(roomId).emit('room_update', { players: room.players, bunkerCondition: room.state.bunkerCondition });
                // Эмиттим событие для Spotlight-анимации на фронтенде
                io.to(roomId).emit('card_revealed', { 
                     playerId: p.id, 
                     playerName: p.name,
                     cardKey, 
                     value: p.character[cardKey] 
                });
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
