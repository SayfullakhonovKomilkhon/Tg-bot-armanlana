const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');

// Replace with your bot token from BotFather
const BOT_TOKEN = '8160097305:AAEwSC9KNV3NsVpITh2FV0gPwo-VXynaL6c';

// Store active chat IDs (will be populated when users interact with bot)
let activeChats = new Set();
let lastActiveChatId = null;

// Create bot instance with robust polling options
const bot = new TelegramBot(BOT_TOKEN, { 
    polling: {
        interval: 1000,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

// Bot startup logging
console.log('🤖 Starting Telegram Wedding Bot...');
console.log('📡 Bot token:', BOT_TOKEN ? 'SET ✅' : 'NOT SET ❌');

// Test bot connection
bot.getMe().then((botInfo) => {
    console.log(`✅ Bot connected successfully: @${botInfo.username}`);
    console.log(`📋 Bot ID: ${botInfo.id}`);
}).catch((error) => {
    console.error('❌ Failed to connect to bot:', error.message);
    console.log('💡 Check your bot token and internet connection');
});

// Create Express server for webhooks
const app = express();

// Add CORS support
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Handle form submissions from the website
app.post('/webhook/form-submission', (req, res) => {
    try {
        const formData = req.body;
        console.log('Received form data:', formData);
        
        // Process and format the form data
        const message = formatWeddingFormMessage(formData);
        
        // Send to all active chats or the most recent one
        const targetChats = activeChats.size > 0 ? Array.from(activeChats) : (lastActiveChatId ? [lastActiveChatId] : []);
        
        if (targetChats.length === 0) {
            console.log('No active chats found. Message will be stored for when someone starts the bot.');
            res.status(200).json({ 
                success: true, 
                message: 'Form received but no active chats. Start the bot with /start to receive messages.' 
            });
            return;
        }
        
        // Send message to all target chats
        const sendPromises = targetChats.map(chatId => 
            bot.sendMessage(chatId, message, { parse_mode: 'HTML' })
                .catch(error => {
                    console.error(`Error sending to chat ${chatId}:`, error);
                    // Remove inactive chat
                    activeChats.delete(chatId);
                })
        );
        
        Promise.allSettled(sendPromises)
            .then((results) => {
                const successful = results.filter(r => r.status === 'fulfilled').length;
                const failed = results.filter(r => r.status === 'rejected').length;
                
                console.log(`Message sent to ${successful} chats, ${failed} failed`);
                res.status(200).json({ 
                    success: true, 
                    message: `Form submitted successfully to ${successful} chat(s)` 
                });
            });
            
    } catch (error) {
        console.error('Error processing form:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Format form data into a readable message
function formatWeddingFormMessage(formData) {
    let message = '💒 <b>Новый RSVP для свадьбы Армана и Ланы</b>\n\n';
    
    // Extract guest names (clean up any JSON data)
    let guestName = '';
    if (formData.name) {
        guestName = formData.name;
        // If it's JSON data, skip it
        if (guestName.startsWith('[{') || guestName.includes('"lid"')) {
            guestName = '';
        }
    }
    
    if (guestName) {
        message += `👥 <b>Гость(и):</b> ${guestName}\n\n`;
    }
    
    // Extract attendance confirmation
    if (formData.attendance) {
        const attendance = formData.attendance;
        const attendanceIcon = attendance.includes('приду') || attendance.includes('удовольствием') ? '✅' : '❌';
        message += `${attendanceIcon} <b>Присутствие:</b> ${attendance}\n\n`;
    }
    
    // Add timestamp
    const timestamp = new Date().toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    message += `⏰ <i>Получено: ${timestamp}</i>`;
    
    // If no valid data was found, indicate that
    if (!guestName && !formData.attendance) {
        message += '\n\n⚠️ <i>Данные формы не были корректно извлечены</i>';
    }
    
    return message;
}

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    // Add chat to active chats
    activeChats.add(chatId);
    lastActiveChatId = chatId;
    
    console.log(`New chat activated: ${chatId}. Total active chats: ${activeChats.size}`);
    
    bot.sendMessage(chatId, 'Привет! Я бот для сбора RSVP на свадьбу Армана и Ланы. Я буду отправлять сюда все ответы с формы приглашения.\n\nЧат активирован ✅');
});

// Handle /status command
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    
    // Add chat to active chats if not already there
    activeChats.add(chatId);
    lastActiveChatId = chatId;
    
    const statusMessage = `🤖 <b>Статус бота:</b>
    
✅ Бот работает и готов принимать RSVP!
📊 Активных чатов: ${activeChats.size}
💬 Этот чат: ${activeChats.has(chatId) ? 'Активен' : 'Активирован'}`;
    
    bot.sendMessage(chatId, statusMessage, { parse_mode: 'HTML' });
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    // Add chat to active chats if not already there
    activeChats.add(chatId);
    lastActiveChatId = chatId;
    
    const helpMessage = `🤖 <b>Бот для RSVP свадьбы</b>

<b>Команды:</b>
/start - Активировать чат для получения RSVP
/status - Проверить статус бота
/help - Показать это сообщение
/stop - Прекратить получение сообщений

<b>Функции:</b>
• Автоматический прием RSVP с сайта
• Форматирование сообщений
• Уведомления о новых гостях
• Поддержка нескольких чатов

<i>Все ответы с формы приглашения будут автоматически отправляться во все активные чаты.</i>`;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
});

// Handle /stop command
bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    
    if (activeChats.has(chatId)) {
        activeChats.delete(chatId);
        bot.sendMessage(chatId, '❌ Чат деактивирован. Вы больше не будете получать RSVP уведомления.\n\nИспользуйте /start чтобы снова активировать.');
    } else {
        bot.sendMessage(chatId, 'ℹ️ Чат уже неактивен. Используйте /start для активации.');
    }
    
    console.log(`Chat deactivated: ${chatId}. Total active chats: ${activeChats.size}`);
});

// Handle any other message (to activate chat)
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Skip if it's a command we already handle
    if (text && text.startsWith('/')) {
        return;
    }
    
    // Add chat to active chats
    if (!activeChats.has(chatId)) {
        activeChats.add(chatId);
        lastActiveChatId = chatId;
        
        console.log(`Chat auto-activated: ${chatId}. Total active chats: ${activeChats.size}`);
        
        bot.sendMessage(chatId, 'Чат активирован! 🤖\n\nТеперь вы будете получать все RSVP с формы приглашения.\n\nИспользуйте /help для просмотра команд.');
    }
});

// Enhanced error handling with auto-restart
bot.on('error', (error) => {
    console.error('❌ Bot error:', error.code || error.message);
    
    if (error.code === 'EFATAL' || error.code === 'ECONNRESET') {
        console.log('🔄 Connection lost, attempting to restart bot...');
        setTimeout(() => {
            try {
                bot.stopPolling();
                setTimeout(() => {
                    bot.startPolling();
                    console.log('✅ Bot polling restarted');
                }, 2000);
            } catch (restartError) {
                console.error('❌ Failed to restart bot:', restartError.message);
            }
        }, 1000);
    }
});

bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error.code || error.message);
    
    // Don't restart on webhook conflicts - just log
    if (error.code === 'ETELEGRAM' && error.response?.body?.description?.includes('webhook')) {
        console.log('⚠️ Webhook conflict detected - this is normal if using webhooks elsewhere');
        return;
    }
    
    // For connection errors, try to restart
    if (error.code === 'EFATAL' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        console.log('🔄 Network error, will retry automatically...');
    }
});

app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Wedding RSVP Bot server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/form-submission`);
    console.log('Bot is ready to receive form submissions!');
});

// Export for testing
module.exports = { app, bot, formatWeddingFormMessage }; 