# 📰 Suara Surabaya Feed Broadcaster

Sistem otomatis untuk menyebarkan berita dari RSS Feed Suara Surabaya ke grup WhatsApp menggunakan Google Apps Script dan WhatsApp Gateway API.

## 🌟 Fitur Utama
- Auto fetch RSS feed dari website Suara Surabaya
- Broadcast otomatis ke WhatsApp (personal/grup)
- Database terintegrasi dengan Google Sheets
- Dashboard monitoring realtime
- Sistem notifikasi multi-channel (Email, Telegram)
- Error handling & retry mechanism
- Logging system
- Auto cleanup data lama

## 📋 Prasyarat
- Akun Google (untuk Google Apps Script & Sheets)
- API Key WhatsApp Gateway
- Nomor WhatsApp untuk sender
- Spreadsheet template (disediakan)

## 🛠️ Instalasi
1. Buat project baru di Google Apps Script
2. Copy seluruh kode ke editor
3. Sesuaikan konfigurasi di bagian CONFIG:
   ```javascript
   const CONFIG = {
     SHEET: {
       ID: 'YOUR_SPREADSHEET_ID',
       // ... konfigurasi lainnya
     },
     WHATSAPP: {
       API_KEY: 'YOUR_API_KEY',
       // ... konfigurasi lainnya
     }
   }
   ```
4. Buat spreadsheet dengan sheet:
   - ssfeed (data artikel)
   - phonebook (daftar nomor)
   - logs (log aktivitas)
   - statistics (statistik)
   - dashboard (monitoring)

5. Jalankan fungsi `initialSetup()`

## 📊 Struktur Spreadsheet
### Sheet: ssfeed
| Column | Description |
|--------|-------------|
| timestamp | Waktu artikel disimpan |
| channel | Sumber artikel |
| title | Judul artikel |
| ... | ... |

### Sheet: phonebook
| Column | Description |
|--------|-------------|
| number | Nomor WhatsApp (format: 628xxx) |
| name | Nama/Keterangan (opsional) |

## 🔧 Penggunaan
- Script berjalan otomatis setiap 10 menit
- Cek dashboard untuk monitoring
- Lihat logs untuk tracking aktivitas
- Gunakan fungsi test untuk debugging

## ⚡ Quick Start
```javascript
function quickTest() {
  fetchDataAndProcess();
}
```

## 📝 Format Pesan
```
📰 *BERITA TERKINI SUARA SURABAYA*
🌆 *Kelana Kota*
📍 *[Judul Berita]*

[Deskripsi Berita]

🕒 2 jam yang lalu
🔗 [Link Berita]
```

## 🤝 Kontribusi
Contributions, issues dan feature requests sangat diterima.

## 📜 Lisensi
[MIT License](LICENSE)

---
