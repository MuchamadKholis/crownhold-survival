# Panduan Deploy & Kode Redeem — Crownhold

## 1. Deploy ke GitHub Pages (gratis)

Crownhold adalah situs statis (HTML + CSS + JS), jadi tidak butuh server.

**Cara termudah (tanpa Git, lewat browser):**
1. Buat akun di github.com, lalu klik **New repository**. Beri nama, misalnya `crownhold`, dan pilih **Public**.
2. Di repo baru, klik **Add file → Upload files**.
3. Seret isi folder project ke sana: `index.html`, folder `css`, `js`, `tools`, `README.md`. Folder `tests` dan `dist` tidak wajib. Klik **Commit changes**.
4. Buka **Settings → Pages**. Di *Build and deployment*, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
5. Tunggu 1–2 menit. Game bisa dibuka di `https://USERNAME.github.io/crownhold/`.

**Dengan Git (kalau sudah terbiasa):**
```
git init
git add .
git commit -m "Crownhold"
git branch -M main
git remote add origin https://github.com/USERNAME/crownhold.git
git push -u origin main
```
Lalu aktifkan Pages seperti langkah 4.

## 2. Deploy ke Cloudflare Pages (gratis)

**Opsi A — upload langsung:**
1. Masuk ke dash.cloudflare.com, buka **Workers & Pages → Create → Pages → Upload assets**.
2. Beri nama proyek, lalu seret folder project (yang berisi `index.html`). Klik **Deploy**.
3. Game langsung online di `https://NAMA-PROYEK.pages.dev`.

**Opsi B — sambungkan ke GitHub (deploy otomatis setiap kali Anda push):**
1. **Workers & Pages → Create → Pages → Connect to Git**, lalu pilih repo `crownhold`.
2. *Framework preset*: **None**. *Build command*: kosongkan. *Build output directory*: `/`.
3. **Save and Deploy**. Setiap perubahan yang di-push ke GitHub akan otomatis tayang.

Domain sendiri bisa ditambahkan di **Custom domains** (GitHub Pages maupun Cloudflare).

> **Saran:** deploy folder sumber (`index.html` + `css` + `js`), bukan file `dist`. Dengan begitu, menambah kode redeem cukup dengan mengedit satu file lalu upload/push ulang, tanpa perlu build.

## 3. Kode redeem

Pemain membuka **More → Redeem code** (atau **Settings → Gift codes**), mengetik kode, lalu menekan **Redeem**.
- Kode tidak peka huruf besar/kecil.
- Setiap kode hanya bisa dipakai sekali per kerajaan (per save).
- Hadiah boleh melebihi batas storage.

**Kode contoh yang sudah ada:**

| Kode | Hadiah | Catatan |
|---|---|---|
| `WELCOME2026` | 1500 gold, 1500 wood, 800 stone, 25 gems | — |
| `CROWNHOLD` | 50 gems, 3 runes, 10 swordsman, 10 archer | berlaku sampai 31-12-2027 |
| `ROYALARMY` | 3000 gold, 4 knight | butuh castle level 3 |

### Cara menambah kode baru

1. Install Node.js (gratis, nodejs.org) jika belum ada.
2. Di folder project, jalankan perintah ini (contoh):
   ```
   node tools/codegen.js LEBARAN2026 gold=5000 gems=30 swordsman=15 expires=2026-04-30 label="Hadiah Lebaran"
   ```
3. Perintah itu mencetak satu baris, misalnya:
   ```
   // LEBARAN2026
   {hash: "1062d8b7c02306", label: "Hadiah Lebaran", reward: {gold: 5000, gems: 30, troops: {swordsman: 15}}, expires: "2026-04-30"},
   ```
4. Buka `js/data/codes.js` dan tempel baris itu di dalam `CH.REDEEM_CODES = [ ... ]`.
5. Upload/push ulang ke GitHub atau Cloudflare. Jika Anda memakai versi satu-file, jalankan dulu `python3 tools/build.py`.

**Pilihan hadiah:**

| Parameter | Isi |
|---|---|
| Sumber daya | `gold=` `wood=` `stone=` `gems=` `runes=` `xp=` |
| Pasukan | nama troop + jumlah: `swordsman` `archer` `spearman` `knight` `mage` `berserker` `paladin` `necromancer` `giant` `golem` `dragonRider` |
| `expires=YYYY-MM-DD` | hari terakhir kode berlaku |
| `start=YYYY-MM-DD` | kode baru aktif mulai tanggal ini |
| `minCastle=3` | minimal level castle |
| `label="..."` | nama hadiah yang tampil ke pemain |

Kalau tidak memakai `codegen.js`, Anda juga bisa menulis entri secara manual, tapi `hash` harus dibuat dengan `CH.hashCode("KODE")`. Bisa juga dicek di console browser: buka game, tekan F12, lalu ketik `CH.hashCode("KODEBARU")`.

Untuk menonaktifkan kode, hapus barisnya atau beri `expires` dengan tanggal yang sudah lewat.

### Penting soal keamanan

Kode disimpan sebagai **hash**, jadi tidak bisa dibaca langsung dari source. Tapi ini game offline/statis: pemain yang paham teknis tetap bisa mengubah save di browsernya sendiri. Untuk game single-player ini tidak masalah.

Jika kelak Anda butuh kode yang benar-benar aman (misalnya terbatas 100 pemakaian global, atau terkait penjualan), validasinya harus di server. Pilihan gratis yang cocok adalah **Cloudflare Workers + KV**: game mengirim kode ke Worker, Worker mengecek dan mencatat pemakaiannya, lalu membalas isi hadiah.
