# HIOSO OLT — SNMP OID Reference

> File ini mendokumentasikan semua SNMP OID yang digunakan di `lib/HiosoOLT.php`  
> Terverifikasi dari hasil polling langsung di lapangan (OLT A, B, C, D — April 2026)  
> Terakhir diperbarui: Mei 2026 — disesuaikan dengan kode aktual `HiosoOLT::PROFILES` dan `$parseSignal`

---

## 1. Enterprise ID (Private MIB Root)

| Vendor | Enterprise OID | Keterangan |
|--------|----------------|-----------|
| Hioso / C-Data | `.1.3.6.1.4.1.25355` | OLT series HA7304V, HA7304C, HA7304VX |
| BDCOM / Huawei clone | `.1.3.6.1.4.1.3320` | OLT berbasis chipset Huawei EPON |

---

## 2. Profile OLT — OID per Tipe

### 2.1 HIOSO_C — Hioso HA7304V (EPON, community: `public`)

> Digunakan di: **OLT C (192.168.75.66)**  
> SNMP limitation: hanya expose 2 grup ONU (`1.1.X` = PON1, `1.2.X` = PON2+3+4 merged)  
> Butuh Telnet scan + k-NN untuk pisahkan PON2/3/4 secara fisik

| Field | OID | Keterangan |
|-------|-----|-----------|
| Nama ONU | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.37` | String, bisa custom atau "NA" |
| Serial Number (SN) | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.11` | Hex string, dikonversi ke MAC-like |
| MAC Address | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.12` | Alternatif SN candidate (hanya di scan awal) |
| Status ONU | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.39` | `1`=online, `2`=offline |
| Jarak (distance) | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.25` | Integer, satuan meter |
| Tx Power | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.4` | Float string dBm (sudah final, contoh: `-2.08`) |
| Rx Power | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.8` | Float string dBm (sudah final, contoh: `-18.50`) |
| Temperature | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.7` | Integer, satuan °C |

**Format index OID**: `{B}.{PON}.{ONU_ID}` — contoh: `1.2.4` = board 1, PON 2, ONU ID 4

**Flag khusus** (`PROFILES['HIOSO_C']`):
- `telnet_pon34_scan = true` — sistem secara otomatis Telnet ke OLT untuk membaca optik PON3 dan PON4 yang tidak terekspos via SNMP

---

### 2.2 HIOSO_B2 — Hioso HA7304C (EPON B, community: `SNMPREAD`)

> Digunakan di: **OLT A (192.168.75.88)**, **OLT B (192.168.75.77)**  
> Terdeteksi via `sysDescr` mengandung string `"HIOSO B"`  
> Expose 4 PON port terpisah secara akurat via SNMP

| Field | OID | Keterangan |
|-------|-----|-----------|
| Nama ONU | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.37` | Sama dengan HIOSO_C |
| Serial Number | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.11` | Sama dengan HIOSO_C |
| Status ONU | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.39` | `1`=online, `2`=offline |
| Jarak (distance) | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.25` | Integer, meter |
| Tx Power | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.4` | Float string dBm (sudah final, sama dengan HIOSO_C) |
| Rx Power | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.8` | Float string dBm (sudah final, sama dengan HIOSO_C) |
| Temperature | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.7` | Integer, °C |

> ✅ **HIOSO_C dan HIOSO_B2 menggunakan MIB tree yang sama** (`.25355.3.2.6`). Perbedaannya hanya di SNMP community string dan kemampuan expose PON port.

---

### 2.3 HIOSO_VX — Hioso HA7304VX (EPON, community: `public`)

> Digunakan di: **OLT D (192.168.75.99)**  
> Varian dari HIOSO_C — MIB tree identik

| Field | OID | Keterangan |
|-------|-----|-----------|
| Nama ONU | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.37` | |
| Serial Number | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.11` | |
| Status ONU | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.39` | |
| Jarak (distance) | `.1.3.6.1.4.1.25355.3.2.6.3.2.1.25` | |
| Tx Power | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.4` | Float string dBm (identik dengan HIOSO_C) |
| Rx Power | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.8` | Float string dBm (identik dengan HIOSO_C) |
| Temperature | `.1.3.6.1.4.1.25355.3.2.6.14.2.1.7` | Integer, °C |

> ⚠️ HIOSO_VX **tidak** memiliki flag `telnet_pon34_scan` — berbeda dengan HIOSO_C.

---

### 2.4 HIOSO_B — BDCOM / Huawei Clone (EPON)

> Berbasis chipset Huawei, MIB tree berbeda total (`.3320.101.10`)

| Field | OID | Keterangan |
|-------|-----|-----------|
| Nama ONU | `.1.3.6.1.4.1.3320.101.10.1.1.79` | |
| Serial Number | `.1.3.6.1.4.1.3320.101.10.1.1.3` | |
| Status ONU | `.1.3.6.1.4.1.3320.101.10.1.1.26` | |
| Tx Power | `.1.3.6.1.4.1.3320.101.10.5.1.5` | Integer mentah — di-scale otomatis (lihat Sec. 6) |
| Rx Power | `.1.3.6.1.4.1.3320.101.10.5.1.6` | Integer mentah — di-scale otomatis (lihat Sec. 6) |

> ⚠️ Tidak ada OID Temperature dan Distance pada profile ini.

---

### 2.5 HIOSO_GPON — C-Data GPON

> MIB tree `.25355.3.3` (beda dengan EPON `.25355.3.2`)

| Field | OID | Keterangan |
|-------|-----|-----------|
| Nama ONU | `.1.3.6.1.4.1.25355.3.3.1.1.1.2` | |
| Serial Number | `.1.3.6.1.4.1.25355.3.3.1.1.1.5` | |
| Status ONU | `.1.3.6.1.4.1.25355.3.3.1.1.1.11` | |
| Tx Power | `.1.3.6.1.4.1.25355.3.3.1.1.4.1.2` | Integer mentah — di-scale otomatis (lihat Sec. 6) |
| Rx Power | `.1.3.6.1.4.1.25355.3.3.1.1.4.1.1` | Integer mentah — di-scale otomatis (lihat Sec. 6) |

---

## 3. Perbandingan OID Antar Profile

| Field | HIOSO_C / B2 / VX | HIOSO_B (BDCOM) | HIOSO_GPON |
|-------|-------------------|-----------------|------------|
| **Root MIB** | `.25355.3.2.6` | `.3320.101.10` | `.25355.3.3.1` |
| **Nama ONU** | `...3.2.1.37` | `...1.1.79` | `...1.1.2` |
| **SN/MAC** | `...3.2.1.11` | `...1.1.3` | `...1.1.5` |
| **Status** | `...3.2.1.39` | `...1.1.26` | `...1.1.11` |
| **Tx Power** | `...14.2.1.4` | `...5.1.5` | `...4.1.2` |
| **Rx Power** | `...14.2.1.8` | `...5.1.6` | `...4.1.1` |
| **Temperature** | `...14.2.1.7` | ❌ | ❌ |
| **Jarak** | `...3.2.1.25` | ❌ | ❌ |
| **Divider Rx/Tx** | float dBm langsung | auto-scale (magnitude) | auto-scale (magnitude) |
| **`divider` di PROFILES** | `1` | `10` | `100` |

---

## 4. SN Candidate OIDs (Auto-Detection)

Saat OLT baru pertama kali ditambahkan, sistem scan semua kandidat OID berikut untuk menemukan mana yang mengembalikan data valid:

```
{activeProfile.sn}                 — OID SN dari profile aktif (misal .25355.3.2.6.3.2.1.11)
{parentBranch}.11                  — parentBranch = prefix name OID tanpa digit terakhir
.1.3.6.1.4.1.25355.3.2.10.1.1.2   — kandidat SN tipe 1
{parentBranch}.12                  — MAC address dalam branch yang sama
{parentBranch}.2                   — ONU field alternatif dalam branch yang sama
.1.3.6.1.4.1.25355.3.2.1.2.1.2    — kandidat SN tipe 2
.1.3.6.1.4.1.25355.3.2.6.1.1.18   — kandidat SN tipe 3
.1.3.6.1.4.1.25355.3.2.6.3.2.1.12 — MAC address (absolute)
.1.3.6.1.4.1.25355.3.3.1.1.1.5    — GPON SN
.1.3.6.1.4.1.3320.101.10.1.1.3    — BDCOM SN
```

**parentBranch** dihitung secara dinamis: `substr(activeProfile['name'], 0, strrpos(name, '.'))`.  
Contoh untuk HIOSO_C: `name = ...3.2.6.3.2.1.37` → `parentBranch = ...3.2.6.3.2.1` → kandidat dinamis = `...3.2.6.3.2.1.11`, `...3.2.6.3.2.1.12`, `...3.2.6.3.2.1.2`.

Duplikat dihapus via `array_unique()` sebelum di-scan. OID pemenang (mengembalikan data terbanyak) disimpan di `data/olt_oids/{oltId}.json` dan dipakai langsung pada polling berikutnya (tidak perlu scan ulang).

---

## 5. OID Standard (IF-MIB / RFC 2863)

OID berikut digunakan **semua profile** — tidak vendor-specific.

### 5.1 System Info (SNMPv2-MIB)

| OID | Field | Keterangan |
|-----|-------|-----------|
| `1.3.6.1.2.1.1.1.0` | `sysDescr` | Deskripsi hardware OLT (string) |
| `1.3.6.1.2.1.1.3.0` | `sysUpTime` | Uptime OLT sejak reboot (timeticks) |
| `1.3.6.1.2.1.1.5.0` | `sysName` | Hostname OLT |

### 5.2 Port Status — IF-MIB (ifTable)

| OID | Field | Keterangan |
|-----|-------|-----------|
| `1.3.6.1.2.1.2.2.1.2` | `ifDescr` | Nama interface (PON-1, GE-1, dll) |
| `1.3.6.1.2.1.2.2.1.8` | `ifOperStatus` | Status: `1`=up, `2`=down |
| `1.3.6.1.2.1.2.2.1.10` | `ifInOctets` | Bytes masuk (32-bit, wrap di 4GB) |
| `1.3.6.1.2.1.2.2.1.16` | `ifOutOctets` | Bytes keluar (32-bit) |

### 5.3 Port Counter 64-bit — IF-MIB Extended (ifXTable)

Digunakan jika OLT support (mencegah counter wrap di port gigabit):

| OID | Field | Keterangan |
|-----|-------|-----------|
| `1.3.6.1.2.1.31.1.1.1.6` | `ifHCInOctets` | Bytes masuk 64-bit |
| `1.3.6.1.2.1.31.1.1.1.10` | `ifHCOutOctets` | Bytes keluar 64-bit |
| `1.3.6.1.2.1.31.1.1.1.15` | `ifHighSpeed` | Kecepatan interface (Mbps) |

> Sistem otomatis probe `ifHCInOctets` terlebih dulu. Jika tidak ada respons, fallback ke `ifInOctets` 32-bit.

### 5.4 System Resources — HOST-RESOURCES-MIB (hrTable)

> Hanya pada OLT yang support (HIOSO_B2). Tidak tersedia di HIOSO_C dan HIOSO_VX.

| OID | Field | Keterangan |
|-----|-------|-----------|
| `1.3.6.1.2.1.25.3.3.1.2.768` | `hrProcessorLoad` | CPU load % (index 768 = CPU pertama) |
| `1.3.6.1.2.1.25.2.3.1.5.1` | `hrStorageSize` | Total RAM (unit = 1024 bytes) |
| `1.3.6.1.2.1.25.2.3.1.6.1` | `hrStorageUsed` | RAM terpakai (unit = 1024 bytes) |

---

## 6. Cara Membaca Nilai Rx/Tx Power

Logika parsing Rx/Tx Power di kode (`HiosoOLT::$parseSignal`) berbeda antara profile:

### 6.1 Profile `divider = 1` (HIOSO_C, HIOSO_B2, HIOSO_VX)

SNMP mengembalikan **float string yang sudah dalam satuan dBm** (mis. `"-12.22"`, `"2.08"`).  
Kode hanya melakukan `(float) number_format($num, 2)` — tidak ada konversi unit.

```
SNMP value: "-12.22"  →  Hasil: -12.22 dBm  ✓
SNMP value: "2.08"    →  Hasil:   2.08 dBm  ✓
```

### 6.2 Profile `divider != 1` (HIOSO_B, HIOSO_GPON)

SNMP mengembalikan **integer mentah**. Kode menggunakan **auto-scale berdasarkan magnitude**  
(nilai `$divider` sendiri hanya dipakai untuk membedakan `== 1` vs bukan):

```php
$abs = abs($num);
if ($abs > 500) return round($num / 100, 2);   // mis. -1227 → -12.27 dBm
if ($abs > 50)  return round($num / 10, 2);    // mis. -122  → -12.20 dBm
return round($num, 2);                          // mis. -12   → -12.00 dBm
```

| SNMP Value | `abs > 500`? | `abs > 50`? | Hasil |
|-----------|-------------|------------|-------|
| `-1227` | ✓ | — | `-1227 / 100 = -12.27 dBm` |
| `-122` | ✗ | ✓ | `-122 / 10 = -12.20 dBm` |
| `-12` | ✗ | ✗ | `-12.00 dBm` (langsung) |

> ⚠️ **Catatan dokumen lama** yang menyebut formula `$val / $divider / 100` adalah **salah** — kode aktual menggunakan auto-scale magnitude di atas.

### Signal Level (sig_level)

Fungsi `HiosoOLT::signalLevel(?float $rxDbm): string` — implementasi aktual:

```php
if ($rxDbm === null) return 'unknown';
if ($rxDbm < -27.0)  return 'critical';
if ($rxDbm < -25.0)  return 'warn';
return 'ok';
```

| Kondisi | Label | Warna UI |
|---------|-------|----------|
| `$rxDbm === null` | `unknown` | Abu-abu |
| `$rxDbm < -27.0 dBm` | `critical` | Merah |
| `-27.0 ≤ $rxDbm < -25.0 dBm` | `warn` | Kuning |
| `$rxDbm ≥ -25.0 dBm` | `ok` | Hijau |

---

## 7. Format Index ONU

Index ONU pada OID mengikuti format hirarki board-PON-ONU:

```
{board}.{pon}.{onu_id}
```

**Contoh untuk HIOSO_C (HA7304V):**
- `1.1.1`  → Board 1, PON 1, ONU ID 1
- `1.1.52` → Board 1, PON 1, ONU ID 52 (last ONU on PON1)
- `1.2.1`  → Board 1, PON 2, ONU ID 1 ← SNMP group B=2 (merged PON2/3/4!)
- `1.2.74` → Board 1, PON 2, ONU ID 74 (last in merged group)

**Untuk HIOSO_B2 (HA7304C):**
- `1.1.X` → PON 1
- `1.2.X` → PON 2
- `1.3.X` → PON 3
- `1.4.X` → PON 4
- Semua port terepresentasikan dengan benar di SNMP (tidak ada merge)

---

## 8. Verifikasi via CLI (`snmpwalk`)

Contoh perintah untuk memverifikasi OID secara langsung:

```bash
# Test koneksi dasar (sysDescr)
snmpwalk -v2c -c public 192.168.75.66 1.3.6.1.2.1.1.1.0

# Daftar semua ONU status (HIOSO_C)
snmpwalk -v2c -c public 192.168.75.66 .1.3.6.1.4.1.25355.3.2.6.3.2.1.39

# Rx Power semua ONU (HIOSO_B2, community SNMPREAD)
snmpwalk -v2c -c SNMPREAD 192.168.75.88 .1.3.6.1.4.1.25355.3.2.6.14.2.1.8

# Port status semua interface
snmpwalk -v2c -c public 192.168.75.66 1.3.6.1.2.1.2.2.1.8

# CPU load (hrProcessorLoad) — hanya HIOSO_B2
snmpget -v2c -c SNMPREAD 192.168.75.88 1.3.6.1.2.1.25.3.3.1.2.768
```

---

## 9. OLT Device Map (Salfanet Production)

| OLT ID | Nama | IP | Model | Profile | Community | PON Count |
|--------|------|-----|-------|---------|-----------|-----------|
| `olt_69e17c1abf643` | OLT A | 192.168.75.88 | HA7304C | HIOSO_B2 | SNMPREAD | 4 |
| `olt_69e72ee7309fe` | OLT B | 192.168.75.77 | HA7304C | HIOSO_B2 | SNMPREAD | 4 |
| `olt_69e72e6911857` | OLT C | 192.168.75.66 | HA7304V | HIOSO_C | public | 4 (PON2+3+4 merged di SNMP) |
| `olt_69e72f2ba1f75` | OLT D | 192.168.75.99 | HA7304VX | HIOSO_VX | public | 4 |
