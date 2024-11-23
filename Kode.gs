// ===========================================
// KONFIGURASI
// ===========================================
const CONFIG = {
  SHEET: {
    ID: '<ID-Spreadsheet>',
    FEED_NAME: 'ssfeed',
    LOGS_NAME: 'logs',
    STATS_NAME: 'statistics',
    DASHBOARD_NAME: 'dashboard',
    PHONEBOOK_NAME: 'phonebook'
  },
  FEED: {
    URL: 'https://www.suarasurabaya.net/feed/',
    SOURCE_NAME: 'Suara-Surabaya',
    UPDATE_INTERVAL: 10 // dalam menit
  },
  WHATSAPP: {
    API_KEY: '<apikey>',
    SENDER: '<sender>',
    API_URL: 'https://Mpedia/send-media',
    MESSAGE_HEADER: "📰 *BERITA TERKINI SUARA SURABAYA*",
    DELAY_BETWEEN_SENDS: 1000 // delay 1 detik antar pengiriman
  },
  RETENTION: {
    MAX_DAYS: 30,
    CLEANUP_HOUR: 1 // 1 AM
  },
  NOTIFICATION: {
    TELEGRAM_BOT_TOKEN: '<id-token>',
    TELEGRAM_CHAT_ID: '<id-chat>',
    ADMIN_EMAIL: '<email>',
    NOTIFY_ON_ERROR: true
  },
  CONTENT_PROCESSING: {
    REMOVE_HTML: true,
    MAX_DESCRIPTION_LENGTH: 500,
    ALLOWED_TAGS: ['p', 'a', 'b', 'i', 'img'],
    PRIORITY_CATEGORIES: ['breaking-news', 'headline']
  },
  COLUMNS: [
    'timestamp',
    'channel',
    'title',
    'link',
    'author',
    'pubDate',
    'categories', 
    'description',
    'imageUrl',
    'imageType',
    'guid'
  ]
};

// ===========================================
// FUNGSI UTAMA
// ===========================================
function fetchDataAndProcess() {
  try {
    const startTime = new Date();
    logToSheet('Memulai proses fetch data');
    
    const xmlContent = fetchWithRetry(CONFIG.FEED.URL);
    if (!xmlContent) {
      throw new Error("Gagal mengambil XML dari feed setelah beberapa percobaan");
    }
    
    const articles = parseXMLFeed(xmlContent);
    if (!articles) {
      throw new Error("Gagal memparse XML feed");
    }
    
    const newArticles = saveAndGetNewArticles(articles);
    if (newArticles.length > 0) {
      logToSheet(`Ditemukan ${newArticles.length} artikel baru`);
      sendWhatsAppUpdates(newArticles);
      updateStatistics(startTime, newArticles.length);
      updateDashboard();
      notifyNewArticles(newArticles.length);
    } else {
      logToSheet('Tidak ada artikel baru');
    }
    
  } catch (error) {
    handleError(error);
  } finally {
    logToSheet('Proses fetch data selesai');
  }
}

// ===========================================
// FUNGSI XML PARSER
// ===========================================
function parseXMLFeed(xmlContent) {
  try {
    const document = XmlService.parse(xmlContent);
    const root = document.getRootElement();
    const channel = root.getChild('channel');
    const items = channel.getChildren('item');
    
    return items.map(item => ({
      title: getElementText(item, 'title'),
      link: getElementText(item, 'link'),
      pubDate: getElementText(item, 'pubDate'),
      description: getElementText(item, 'description'),
      author: getElementText(item, 'dc:creator'),
      categories: getCategories(item),
      guid: getGuid(item),
      ...getImageInfo(item)
    }));
  } catch (error) {
    logToSheet("Error parsing XML: " + error);
    handleError(error);
    return null;
  }
}

// ===========================================
// FUNGSI HELPER UNTUK PARSING
// ===========================================
function getElementText(element, tagName) {
  const child = element.getChild(tagName);
  return child ? child.getText() : '';
}

function getCategories(item) {
  const categories = item.getChildren('category');
  return categories.map(cat => cat.getText()).join(', ');
}

function getGuid(item) {
  const guid = item.getChild('guid');
  return guid ? guid.getText() : '';
}

function getImageInfo(item) {
  const enclosure = item.getChild('enclosure');
  if (enclosure) {
    return {
      imageUrl: enclosure.getAttribute('url').getValue(),
      imageType: enclosure.getAttribute('type').getValue()
    };
  }
  return { imageUrl: '', imageType: '' };
}

// ===========================================
// FUNGSI WHATSAPP
// ===========================================
function sendWhatsAppUpdates(articles) {
  const phonebook = getPhonebookNumbers();
  if (!phonebook.length) {
    logToSheet("Tidak ada nomor telepon di phonebook");
    return;
  }

  articles.forEach(article => {
    const messageContent = formatMessageContent(article);
    phonebook.forEach(number => {
      sendWhatsAppMessage(number, messageContent, article.imageUrl);
      Utilities.sleep(CONFIG.WHATSAPP.DELAY_BETWEEN_SENDS);
    });
  });
}

function formatMessageContent(article) {
  const timestamp = new Date(article.pubDate);
  const timeAgo = getTimeAgo(timestamp);
  const categories = article.categories.split(',').map(cat => cat.trim());
  const categoryEmoji = getCategoryEmoji(categories[0]);
  
  return [
    CONFIG.WHATSAPP.MESSAGE_HEADER,
    `\n${categoryEmoji} *${categories[0]}*`,
    `\n📍 *${article.title}*`,
    `\n\n${article.description}`,
    `\n\n🕒 ${timeAgo}`,
    `\n🔗 ${article.link}`
  ].join('');
}

function getCategoryEmoji(category) {
  const categoryEmojis = {
    'Politik': '⚖️',
    'Kelana Kota': '🌆',
    'Ekonomi Bisnis': '💹',
    'Olahraga': '⚽',
    'Pendidikan': '📚',
    'Teknologi': '💻',
    'Kesehatan': '🏥',
    'Hukum': '⚖️',
    'Lifestyle': '🎭',
    'Entertainment': '🎬',
    'default': '📢'
  };

  category = category.toLowerCase();
  for (let key in categoryEmojis) {
    if (category.includes(key.toLowerCase())) {
      return categoryEmojis[key];
    }
  }
  return categoryEmojis.default;
}

function sendWhatsAppMessage(number, content, imageUrl) {
  const payload = {
    'api_key': CONFIG.WHATSAPP.API_KEY,
    'sender': CONFIG.WHATSAPP.SENDER,
    'number': number,
    'media_type': 'image',
    'caption': content,
    'url': imageUrl
  };
  
  const options = {
    'method': 'POST',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload)
  };
  
  try {
    const response = UrlFetchApp.fetch(CONFIG.WHATSAPP.API_URL, options);
    const result = JSON.parse(response.getContentText());
    
    logToSheet(`Nomor: ${number} | Respons: ${response.getContentText()}`);
    
    if (result.status === true) {
      logToSheet(`Pesan berhasil dikirim ke nomor: ${number}`);
    } else {
      logToSheet(`Gagal mengirim pesan ke nomor: ${number}. Respons: ${result.msg}`);
    }
  } catch (error) {
    logToSheet(`Error saat mengirim pesan ke nomor: ${number}. Error: ${error}`);
    handleError(error);
  }
}

// ===========================================
// FUNGSI SPREADSHEET
// ===========================================
function saveAndGetNewArticles(articles) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET.ID);
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEET.FEED_NAME);
  
  if (!sheet) {
    throw new Error(`Sheet '${CONFIG.SHEET.FEED_NAME}' tidak ditemukan.`);
  }
  
  // Inisialisasi sheet jika kosong
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CONFIG.COLUMNS.length)
         .setValues([CONFIG.COLUMNS]);
  }
  
  // Cek duplikasi dan dapatkan artikel baru
  const existingData = sheet.getDataRange().getValues();
  const existingGuids = existingData.map(row => row[CONFIG.COLUMNS.indexOf('guid')]);
  const newArticles = [];
  
  articles.forEach(article => {
    if (!existingGuids.includes(article.guid)) {
      const row = [
        new Date(),
        CONFIG.FEED.SOURCE_NAME,
        article.title,
        article.link,
        article.author,
        article.pubDate,
        article.categories,
        article.description,
        article.imageUrl,
        article.imageType,
        article.guid
      ];
      
      sheet.appendRow(row);
      newArticles.push(article);
      logToSheet(`Artikel baru ditambahkan: ${article.title}`);
    }
  });
  
  return newArticles;
}

function getPhonebookNumbers() {
  const sheet = SpreadsheetApp.openById(CONFIG.SHEET.ID)
                             .getSheetByName(CONFIG.SHEET.PHONEBOOK_NAME);
  if (!sheet) {
    logToSheet(`Sheet '${CONFIG.SHEET.PHONEBOOK_NAME}' tidak ditemukan`);
    return [];
  }
  
  const data = sheet.getDataRange().getValues();
  // Mengabaikan baris header dan mengambil hanya nomor yang valid
  return data.slice(1)
             .map(row => String(row[0]).trim())
             .filter(number => validatePhoneNumber(number));
}

// ===========================================
// ERROR HANDLING
// ===========================================
function handleError(error) {
  const errorMessage = `ERROR: ${error.message}`;
  console.error(errorMessage);
  
  // Log ke sheet
  logToSheet(errorMessage);
  
  // Kirim notifikasi jika dikonfigurasi
  if (CONFIG.NOTIFICATION.NOTIFY_ON_ERROR) {
    // Notifikasi email
    if (CONFIG.NOTIFICATION.ADMIN_EMAIL) {
      MailApp.sendEmail({
        to: CONFIG.NOTIFICATION.ADMIN_EMAIL,
        subject: 'Feed Parser Error',
        body: `Error pada Feed Parser\n\n` +
              `Pesan: ${error.message}\n` +
              `Waktu: ${new Date().toLocaleString()}\n` +
              `Stack: ${error.stack}\n\n` +
              `Detail Error:\n${JSON.stringify(error, null, 2)}`
      });
    }
    
    // Notifikasi Telegram jika dikonfigurasi
    if (CONFIG.NOTIFICATION.TELEGRAM_BOT_TOKEN && CONFIG.NOTIFICATION.TELEGRAM_CHAT_ID) {
      const telegramMessage = `❌ *ERROR: Feed Parser*\n\n` +
                            `Pesan: ${error.message}\n` +
                            `Waktu: ${new Date().toLocaleString()}`;
      
      try {
        sendTelegramMessage(telegramMessage);
      } catch (telegramError) {
        console.error('Gagal mengirim notifikasi Telegram:', telegramError);
        logToSheet('Gagal mengirim notifikasi Telegram: ' + telegramError.message);
      }
    }
  }
  
  // Log error details untuk debugging
  if (error.stack) {
    logToSheet('Stack Trace: ' + error.stack);
  }
  
  // Update status di dashboard jika ada
  try {
    updateDashboardError(error);
  } catch (dashboardError) {
    console.error('Gagal update dashboard:', dashboardError);
  }
}

// ===========================================
// FUNGSI UTILITY
// ===========================================
function getTimeAgo(timestamp) {
  const now = new Date();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins} menit yang lalu`;
  } else if (diffHours < 24) {
    return `${diffHours} jam yang lalu`;
  } else if (diffDays < 7) {
    return `${diffDays} hari yang lalu`;
  } else {
    return timestamp.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

function validatePhoneNumber(number) {
  const formattedNumber = String(number).trim();
  const phoneRegex = /^[0-9]{10,15}(@g\.us)?$/;
  return phoneRegex.test(formattedNumber);
}

function logToSheet(message) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET.ID);
  const logsSheet = spreadsheet.getSheetByName(CONFIG.SHEET.LOGS_NAME);
  
  if (!logsSheet) {
    console.error(`Sheet '${CONFIG.SHEET.LOGS_NAME}' tidak ditemukan.`);
    return;
  }
  
  logsSheet.appendRow([new Date(), message]);
}

function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = UrlFetchApp.fetch(url);
      return response.getContentText();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      const waitTime = Math.pow(2, i) * 1000;
      Utilities.sleep(waitTime);
      
      logToSheet(`Retry ${i + 1}/${maxRetries} for URL: ${url}`);
    }
  }
}

// ===========================================
// FUNGSI DASHBOARD
// ===========================================
function updateDashboard() {
  const dashboard = getOrCreateSheet(CONFIG.SHEET.DASHBOARD_NAME);
  const stats = calculateDashboardStats();
  
  dashboard.clear();
  dashboard.getRange('A1').setValue('Dashboard Updated: ' + new Date());
// Lanjutan fungsi updateDashboard...
  dashboard.getRange('A3').setValue('Statistik 24 Jam Terakhir:');
  dashboard.getRange('A4:B8').setValues([
    ['Total Artikel Baru', stats.newArticles24h],
    ['Artikel per Kategori', formatCategoryStats(stats.categoryCount)],
    ['Rata-rata Waktu Eksekusi', stats.avgExecutionTime + ' detik'],
    ['Status Error', stats.errorCount],
    ['Penggunaan Storage', stats.storageUsage + '%']
  ]);
}

function updateDashboardError(error) {
  const dashboard = getOrCreateSheet(CONFIG.SHEET.DASHBOARD_NAME);
  const errorCell = dashboard.getRange('B10'); // Sesuaikan dengan layout dashboard
  errorCell.setValue(`Last Error: ${error.message} (${new Date().toLocaleString()})`);
}

function getOrCreateSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET.ID);
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    initializeSheet(sheet, sheetName);
  }
  
  return sheet;
}

function initializeSheet(sheet, sheetName) {
  switch(sheetName) {
    case CONFIG.SHEET.DASHBOARD_NAME:
      sheet.getRange('A1').setValue('Dashboard Status');
      sheet.getRange('A10').setValue('Error Status');
      break;
    case CONFIG.SHEET.LOGS_NAME:
      sheet.getRange('A1:B1').setValues([['Timestamp', 'Message']]);
      break;
    case CONFIG.SHEET.STATS_NAME:
      sheet.getRange('A1:G1').setValues([['Timestamp', 'Articles Processed', 'Execution Time', 'Success', 'Total Articles', 'Oldest Article', 'Newest Article']]);
      break;
  }
  sheet.setFrozenRows(1);
}

// ===========================================
// FUNGSI STATISTIK
// ===========================================
function updateStatistics(startTime, articlesCount) {
  const sheet = getOrCreateSheet(CONFIG.SHEET.STATS_NAME);
  const endTime = new Date();
  const executionTime = (endTime - startTime) / 1000; // dalam detik
  
  const stats = {
    timestamp: new Date(),
    articles_processed: articlesCount,
    execution_time: executionTime,
    success: true,
    total_articles: getTotalArticleCount(),
    oldest_article: getOldestArticleDate(),
    newest_article: getNewestArticleDate()
  };
  
  sheet.appendRow(Object.values(stats));
}

function calculateDashboardStats() {
  const feedSheet = SpreadsheetApp.openById(CONFIG.SHEET.ID)
                                 .getSheetByName(CONFIG.SHEET.FEED_NAME);
  const data = feedSheet.getDataRange().getValues();
  const headers = data.shift();
  
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  return {
    newArticles24h: data.filter(row => new Date(row[0]) > last24h).length,
    categoryCount: calculateCategoryDistribution(data, headers.indexOf('categories')),
    avgExecutionTime: calculateAverageExecutionTime(),
    errorCount: getErrorCount(),
    storageUsage: calculateStorageUsage()
  };
}

function calculateCategoryDistribution(data, categoryIndex) {
  const distribution = {};
  data.forEach(row => {
    const categories = row[categoryIndex].split(',').map(c => c.trim());
    categories.forEach(category => {
      distribution[category] = (distribution[category] || 0) + 1;
    });
  });
  return distribution;
}

function formatCategoryStats(categoryCount) {
  return Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${category}: ${count}`)
    .join('\n');
}

function getTotalArticleCount() {
  const sheet = SpreadsheetApp.openById(CONFIG.SHEET.ID)
                             .getSheetByName(CONFIG.SHEET.FEED_NAME);
  return sheet.getLastRow() - 1; // Kurangi 1 untuk header
}

function getOldestArticleDate() {
  const sheet = SpreadsheetApp.openById(CONFIG.SHEET.ID)
                             .getSheetByName(CONFIG.SHEET.FEED_NAME);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return new Date();
  return new Date(data[1][CONFIG.COLUMNS.indexOf('pubDate')]);
}

function getNewestArticleDate() {
  const sheet = SpreadsheetApp.openById(CONFIG.SHEET.ID)
                             .getSheetByName(CONFIG.SHEET.FEED_NAME);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return new Date();
  return new Date(data[data.length - 1][CONFIG.COLUMNS.indexOf('pubDate')]);
}

function calculateAverageExecutionTime() {
  const statsSheet = getOrCreateSheet(CONFIG.SHEET.STATS_NAME);
  const data = statsSheet.getDataRange().getValues();
  if (data.length < 2) return 0;
  
  const executionTimes = data.slice(1).map(row => row[2]); // Index 2 adalah execution_time
  const sum = executionTimes.reduce((a, b) => a + b, 0);
  return (sum / executionTimes.length).toFixed(2);
}

function getErrorCount() {
  const logsSheet = SpreadsheetApp.openById(CONFIG.SHEET.ID)
                                 .getSheetByName(CONFIG.SHEET.LOGS_NAME);
  const data = logsSheet.getDataRange().getValues();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  return data.filter(row => 
    new Date(row[0]) > last24h && 
    row[1].toLowerCase().includes('error')
  ).length;
}

function calculateStorageUsage() {
  const file = DriveApp.getFileById(CONFIG.SHEET.ID);
  const sizeInBytes = file.getSize();
  const maxSize = 10 * 1024 * 1024; // 10MB limit untuk contoh
  return Math.round((sizeInBytes / maxSize) * 100);
}

// ===========================================
// FUNGSI NOTIFIKASI
// ===========================================
function notifyNewArticles(count) {
  const message = `🆕 ${count} artikel baru telah ditambahkan\n` +
                 `Total artikel: ${getTotalArticleCount()}\n` +
                 `Waktu: ${new Date().toLocaleString()}`;
  
  if (CONFIG.NOTIFICATION.TELEGRAM_BOT_TOKEN) {
    sendTelegramMessage(message);
  }
  
  if (CONFIG.NOTIFICATION.ADMIN_EMAIL) {
    MailApp.sendEmail({
      to: CONFIG.NOTIFICATION.ADMIN_EMAIL,
      subject: 'Feed Parser - Artikel Baru',
      body: message
    });
  }
}

function sendTelegramMessage(message) {
  if (!CONFIG.NOTIFICATION.TELEGRAM_BOT_TOKEN || !CONFIG.NOTIFICATION.TELEGRAM_CHAT_ID) {
    return;
  }
  
  const url = `https://api.telegram.org/bot${CONFIG.NOTIFICATION.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: CONFIG.NOTIFICATION.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'Markdown'
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    console.error('Telegram notification failed:', error);
    logToSheet('Gagal mengirim notifikasi Telegram: ' + error.message);
  }
}

// ===========================================
// SETUP TRIGGERS
// ===========================================
function setupAllTriggers() {
  deleteOldTriggers();
  
  // Trigger utama untuk fetch dan kirim
  ScriptApp.newTrigger('fetchDataAndProcess')
    .timeBased()
    .everyMinutes(CONFIG.FEED.UPDATE_INTERVAL)
    .create();
  
  // Trigger untuk cleanup
  ScriptApp.newTrigger('cleanupOldArticles')
    .timeBased()
    .atHour(CONFIG.RETENTION.CLEANUP_HOUR)
    .everyDays(1)
    .create();
  
  // Trigger untuk update dashboard
  ScriptApp.newTrigger('updateDashboard')
    .timeBased()
    .everyHours(1)
    .create();
}

function deleteOldTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
}

// ===========================================
// FUNGSI CLEANUP
// ===========================================
function cleanupOldArticles() {
  const sheet = SpreadsheetApp.openById(CONFIG.SHEET.ID)
                             .getSheetByName(CONFIG.SHEET.FEED_NAME);
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  const cutoffDate = new Date(today.setDate(today.getDate() - CONFIG.RETENTION.MAX_DAYS));
  
  let rowsToDelete = [];
  for (let i = data.length - 1; i > 0; i--) {
    if (new Date(data[i][0]) < cutoffDate) {
      rowsToDelete.push(i + 1);
    }
  }
  
  for (let row of rowsToDelete) {
    sheet.deleteRow(row);
  }
  
  logToSheet(`Cleaned up ${rowsToDelete.length} old articles`);
}

// ===========================================
// FUNGSI TESTING
// ===========================================
function runTest() {
  fetchDataAndProcess();
}

function testWhatsAppSend() {
  const testMessage = "🔍 *TEST MESSAGE*\nIni adalah pesan test.";
  const testImage = "https://example.com/test-image.jpg";
  const phonebook = getPhonebookNumbers();
  
  if (phonebook.length > 0) {
    sendWhatsAppMessage(phonebook[0], testMessage, testImage);
  } else {
    logToSheet("Tidak ada nomor di phonebook untuk testing");
  }
}

// Setup awal
function initialSetup() {
  setupAllTriggers();
  getOrCreateSheet(CONFIG.SHEET.FEED_NAME);
  getOrCreateSheet(CONFIG.SHEET.LOGS_NAME);
  getOrCreateSheet(CONFIG.SHEET.STATS_NAME);
  getOrCreateSheet(CONFIG.SHEET.DASHBOARD_NAME);
  getOrCreateSheet(CONFIG.SHEET.PHONEBOOK_NAME);
  runTest();
}
