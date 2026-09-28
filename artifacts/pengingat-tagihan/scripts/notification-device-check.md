# Pemeriksaan ketukan notifikasi di Android dan iOS

## Pengujian otomatis

Jalankan dari akar workspace:

```sh
node --test artifacts/pengingat-tagihan/scripts/notification-tap.test.mjs artifacts/pengingat-tagihan/scripts/reminder-target.test.mjs
pnpm --filter @workspace/pengingat-tagihan run typecheck
```

`notification-tap.test.mjs` menguji integrasi handler dengan **tiruan API respons native**
(`addNotificationResponseReceivedListener`, `getLastNotificationResponse`,
`clearLastNotificationResponse`) dan navigasi, bukan sistem notifikasi perangkat.
Masing-masing skenario Android/iOS dalam tes ini memakai respons berbentuk sama;
tes otomatis **tidak membuktikan** perilaku OS ketika aplikasi ditutup.

## Pemeriksaan pada perangkat asli (dapat diulang)

Gunakan build pengembangan/Expo Go di ponsel Android dan iOS. Izinkan notifikasi
di pengaturan OS. Buat satu tagihan, satu hutang, satu piutang, dan satu biaya
rutin (masing-masing dengan nama berbeda) terlebih dahulu. Dari halaman
Tagihan pilih **Uji notifikasi perangkat**; menu dan layar ini hanya muncul dalam
mode pengembangan dan tidak tersedia di web atau build produksi.

Untuk **setiap pilihan** pada layar itu, jalankan tiga kali:

1. **Aktif:** tetap di aplikasi sampai notifikasi muncul, lalu ketuk bannernya.
2. **Latar belakang:** jadwalkan lagi, pindah ke layar utama ponsel sebelum
   10 detik berlalu, lalu ketuk notifikasinya.
3. **Tertutup:** jadwalkan lagi, tutup aplikasi dari pengalih aplikasi sebelum
   10 detik berlalu, lalu ketuk notifikasinya. Pastikan aplikasi benar-benar
   memulai ulang, bukan hanya kembali dari latar belakang.

Ekspektasi: tagihan membuka formulir tagihan dengan nama yang dipilih; hutang
dan piutang membuka formulir catatan dengan orang/arah yang tepat; biaya rutin
membuka formulir biaya rutin dengan judul yang dipilih. Untuk dua pilihan
"yang sudah dihapus", ketukan harus membuka **daftar** Tagihan/Catatan dan
menampilkan peringatan, **bukan** formulir tambah kosong. Ulangi juga setelah
menjadwalkan notifikasi untuk catatan nyata lalu menghapus catatan itu sebelum
notifikasinya muncul. Bila izin ditolak, aktifkan izin di pengaturan dan ulangi.

Catat hasil per platform dan keadaan aplikasi sebagai Lulus/Gagal serta versi
OS dan Expo Go/build yang dipakai. Belum ada hasil ketukan perangkat fisik
yang dicatat dalam workspace ini; jangan anggap tes otomatis sebagai bukti itu.