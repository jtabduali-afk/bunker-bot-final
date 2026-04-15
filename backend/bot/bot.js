import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const botToken = process.env.BOT_TOKEN;
if (!botToken || botToken === 'ТВОЙ_ТОКЕН_ИЗ_BOTFATHER') {
    console.warn("[WARN] BOT_TOKEN не установлен в .env! Бот не сможет запуститься корректно.");
}

export const bot = botToken && botToken !== 'ТВОЙ_ТОКЕН_ИЗ_BOTFATHER' ? new Telegraf(botToken) : {
    // Временная заглушка, если токена пока нет
    launch: () => console.log('Dummy bot launched (Токен отсутствует)'),
    command: () => {},
    on: () => {},
    telegram: { 
        sendMessage: async () => ({ message_id: 0 }), 
        copyMessage: async () => ({ message_id: 0 }),
        deleteMessage: async () => true,
        getChatMember: async () => ({ status: 'left' }), // По умолчанию считаем, что не подписан в режиме заглушки
        setChatMenuButton: async () => true
    }
};

// Хранилище ID последних меню для каждого пользователя { userId: messageId }
const userMenus = new Map();

async function deleteOldMenu(ctx) {
    const userId = ctx.from.id;
    if (userMenus.has(userId)) {
        try {
            await ctx.telegram.deleteMessage(userId, userMenus.get(userId));
        } catch (err) {
            // Игнорируем ошибки (если сообщение уже удалено)
        }
    }
}

export function setupBot(gameManager) {
    // Обработка команды /start
    bot.command('start', async (ctx) => {
        await deleteOldMenu(ctx);
        const sentMsg = await ctx.reply('☢️ *Убежище «Бункер» приветствует тебя.*\n\nЗдесь решается, кто достоин возродить человечество, а кто останется снаружи. Нажми кнопку ниже или в меню, чтобы войти.', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 ВОЙТИ В БУНКЕР', process.env.FRONTEND_URL || 'https://google.com')]
            ])
        });
        userMenus.set(ctx.from.id, sentMsg.message_id);
    });

    // Обработка кнопок (больше не требуется для создания комнат через бота)
    bot.on('callback_query', async (ctx) => {
        ctx.answerCbQuery('Используйте меню приложения!');
    });

    // Убираем механику оправданий через бота по просьбе пользователя
    bot.on(['text', 'voice', 'video_note'], async (ctx) => {
        if (ctx.message.text && ctx.message.text.startsWith('/')) return;
        
        if (ctx.message.chat.type === 'private') {
            ctx.reply('Слушай, используй интерфейс приложения для общения в игре! Бот теперь только для управления комнатами. 🤫');
        }
    });

    return bot;
}

// Хелпер для уведомления об изгнании
export async function notifyExiled(playerId, playerName) {
    try {
        await bot.telegram.sendMessage(playerId, `💀 **Команда приняла решение.**\n\n${playerName}, вас изгнали из бункера! Теперь вы лишь призрак, наблюдающий за концом человечества...`, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error(`Не удалось отправить уведомление об изгнании ${playerId}:`, err);
    }
}
