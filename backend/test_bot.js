import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.telegram.getMe().then((me) => {
    console.log('Bot is healthy:', me.username);
    process.exit(0);
}).catch((err) => {
    console.error('Bot health check failed:', err);
    process.exit(1);
});
