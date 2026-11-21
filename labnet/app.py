# -*- coding: utf-8 -*-
"""
LABNET - Universite Merkezi Laboratuvar Yonetim Yazilimi

Kapali kampus aginda (VLAN / Eduroam / VPN) calisacak sekilde tasarlanmistir.
Dis internete bagimlilik yoktur: arayuz tek bir HTML dosyasidir, harici CDN,
font veya ikon kutuphanesi kullanilmaz.

Calistirma:
    pip install -r requirements.txt
    python app.py                 (waitress ile 0.0.0.0:8080)

Ortam degiskenleri:
    LABNET_SECRET        Oturum imzalama anahtari (uretimde mutlaka degistirin)
    LABNET_DB            Veritabani dosyasi (varsayilan: app.py yanindaki labnet.db)
    LABNET_HOST          Dinlenecek adres (varsayilan 0.0.0.0)
    LABNET_PORT          Port (varsayilan 8080)
    LABNET_BEHIND_PROXY  "1" ise X-Forwarded-For basligina guvenilir (ters vekil arkasinda)
"""

import ipaddress
import os
import re
import smtplib
import sqlite3
import ssl
import tempfile
import threading
import time
import uuid
import zipfile
from io import BytesIO
from xml.sax.saxutils import escape as xml_escape
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from functools import wraps

from flask import (Flask, g, jsonify, render_template, request, send_file,
                   session, after_this_request)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("LABNET_DB", os.path.join(BASE_DIR, "labnet.db"))
DEFAULT_SECRET = "dev-gecici-anahtar-degistiriniz"
SECRET_KEY = os.environ.get("LABNET_SECRET", DEFAULT_SECRET)

app = Flask(__name__, template_folder=os.path.join(BASE_DIR, "templates"))
app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    JSON_AS_ASCII=False,
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)
app.json.ensure_ascii = False

if os.environ.get("LABNET_BEHIND_PROXY") == "1":
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

ROLES = ("admin", "advisor", "lab_manager", "student")
ROLE_LABELS = {
    "admin": "Sistem Yöneticisi",
    "advisor": "Akademik Danışman",
    "lab_manager": "Lab. Sorumlusu",
    "student": "Öğrenci",
}
DEVICE_STATUSES = ("active", "maintenance", "broken")
DEVICE_STATUS_LABELS = {"active": "Aktif", "maintenance": "Bakımda", "broken": "Arızalı"}
RES_STATUS_LABELS = {
    "pending_advisor": "Danışman Onayı Bekliyor",
    "pending_lab": "Lab. Sorumlusu Onayı Bekliyor",
    "approved": "Onaylandı",
    "rejected": "Reddedildi",
    "completed": "Tamamlandı",
    "cancelled": "İptal Edildi",
}
BLOCKING_STATUSES = ("pending_advisor", "pending_lab", "approved")

DEFAULT_SETTINGS = {
    "allowed_cidrs": "127.0.0.1/32,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
    "ip_filter_enabled": "0",
    "ldap_enabled": "0",
    "ldap_server": "",
    "ldap_port": "389",
    "ldap_base_dn": "",
    "ldap_bind_dn": "",
    "ldap_bind_pass": "",
    "smtp_enabled": "0",
    "smtp_host": "",
    "smtp_port": "587",
    "smtp_user": "",
    "smtp_pass": "",
    "smtp_from": "",
    "noshow_minutes": "15",
    "checkin_early_minutes": "15",
    "institution_name": "Fen-Edebiyat ve Ziraat Fakülteleri Araştırma Laboratuvarları",
}
SECRET_SETTINGS = ("ldap_bind_pass", "smtp_pass")

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


# --------------------------------------------------------------------------
# Veritabani
# --------------------------------------------------------------------------

def connect_db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','advisor','lab_manager','student')),
    department TEXT,
    isg_valid_until TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS faculties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS laboratories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    building_room TEXT,
    manager_id INTEGER REFERENCES users(id),
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    faculty_id INTEGER REFERENCES faculties(id)
);
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lab_id INTEGER NOT NULL REFERENCES laboratories(id),
    name TEXT NOT NULL,
    brand_model TEXT,
    serial_no TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','broken')),
    requires_certificate INTEGER NOT NULL DEFAULT 0,
    requires_isg INTEGER NOT NULL DEFAULT 0,
    max_daily_hours INTEGER NOT NULL DEFAULT 8,
    usage_notes TEXT,
    min_minutes INTEGER NOT NULL DEFAULT 30,
    max_advance_days INTEGER NOT NULL DEFAULT 60,
    weekly_max_hours INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    device_id INTEGER NOT NULL REFERENCES devices(id),
    granted_by INTEGER REFERENCES users(id),
    granted_at TEXT NOT NULL,
    expires_at TEXT
);
CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    device_id INTEGER NOT NULL REFERENCES devices(id),
    advisor_id INTEGER REFERENCES users(id),
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    project_title TEXT NOT NULL,
    purpose TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending_advisor','pending_lab','approved','rejected','completed','cancelled')),
    advisor_note TEXT,
    lab_note TEXT,
    actual_hours REAL,
    usage_report TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    no_show INTEGER NOT NULL DEFAULT 0,
    series_id TEXT
);
CREATE TABLE IF NOT EXISTS device_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES devices(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    resolution_note TEXT,
    resolved_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_res_device_date ON reservations(device_id, date);
CREATE INDEX IF NOT EXISTS idx_res_user ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_cert_user_device ON user_certificates(user_id, device_id);
"""

# Eski surumden kalan veritabanlarina sonradan eklenen sutunlar.
MIGRATIONS = {
    "laboratories": [("faculty_id", "INTEGER REFERENCES faculties(id)")],
    "devices": [("min_minutes", "INTEGER NOT NULL DEFAULT 30"), ("max_advance_days", "INTEGER NOT NULL DEFAULT 60"),
                ("weekly_max_hours", "INTEGER NOT NULL DEFAULT 0")],
    "reservations": [("started_at", "TEXT"), ("ended_at", "TEXT"), ("no_show", "INTEGER NOT NULL DEFAULT 0"),
                     ("series_id", "TEXT")],
}


def migrate(conn):
    for table, cols in MIGRATIONS.items():
        have = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        for name, decl in cols:
            if name not in have:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_res_series ON reservations(series_id)")


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def seed_data(conn):
    today = date.today()

    def d(days):
        return (today + timedelta(days=days)).isoformat()

    pw = generate_password_hash("1234")
    fac_ids = {}
    for code, name in (("FEF", "Fen-Edebiyat Fakültesi"), ("ZF", "Ziraat Fakültesi")):
        fac_ids[code] = conn.execute("INSERT INTO faculties (name, code) VALUES (?,?)", (name, code)).lastrowid

    users = [
        ("Sistem Yöneticisi", "yonetici@universite.edu.tr", "admin", "Bilgi İşlem Daire Başkanlığı", d(365)),
        ("Prof. Dr. Ahmet Kaya", "danisman@universite.edu.tr", "advisor", "Ziraat Fakültesi - Zootekni Bölümü", d(300)),
        ("Öğr. Gör. Selin Demir", "sorumlu@universite.edu.tr", "lab_manager", "Ziraat Fakültesi - Merkez Laboratuvarı", d(240)),
        ("Ali Yılmaz", "ali.yilmaz@ogr.universite.edu.tr", "student", "Ziraat Fakültesi - Zootekni (Yüksek Lisans)", d(180)),
        ("Doç. Dr. Elif Şahin", "elif.sahin@universite.edu.tr", "advisor", "Fen-Edebiyat Fakültesi - Biyoloji Bölümü", d(200)),
        ("Dr. Murat Öztürk", "murat.ozturk@universite.edu.tr", "lab_manager", "Fen-Edebiyat Fakültesi - Kimya Bölümü", d(150)),
        ("Zeynep Arslan", "zeynep.arslan@ogr.universite.edu.tr", "student", "Fen-Edebiyat Fakültesi - Biyoloji (Doktora)", d(-20)),
        ("Can Aydın", "can.aydin@ogr.universite.edu.tr", "student", "Fen-Edebiyat Fakültesi - Kimya (Yüksek Lisans)", d(90)),
        ("Doç. Dr. Hasan Çelik", "hasan.celik@universite.edu.tr", "advisor", "Ziraat Fakültesi - Toprak Bilimi ve Bitki Besleme Bölümü", d(210)),
        ("Ayşe Koç", "ayse.koc@ogr.universite.edu.tr", "student", "Ziraat Fakültesi - Toprak Bilimi (Yüksek Lisans)", d(120)),
    ]
    ids = {}
    for full_name, email, role, dept, isg in users:
        cur = conn.execute(
            "INSERT INTO users (full_name,email,password_hash,role,department,isg_valid_until,is_active) "
            "VALUES (?,?,?,?,?,?,1)", (full_name, email, pw, role, dept, isg))
        ids[email] = cur.lastrowid

    selin = ids["sorumlu@universite.edu.tr"]
    murat = ids["murat.ozturk@universite.edu.tr"]
    labs = [
        ("ZF", "Yem Analiz ve Hayvan Besleme Lab.", "ZF-YEM", "Ziraat Fakültesi, Zootekni Binası Z-12", selin,
         "Kaba ve kesif yemlerde besin madde analizleri (ham protein, ham selüloz, NDF/ADF, NIR ile hızlı analiz)."),
        ("ZF", "Toprak ve Bitki Besleme Analiz Lab.", "ZF-TOP", "Ziraat Fakültesi, Toprak Bölümü T-04", selin,
         "Toprak, bitki ve su örneklerinde makro-mikro element ve organik madde analizleri."),
        ("ZF", "Bitki Doku Kültürü ve Büyütme Lab.", "ZF-BIT", "Ziraat Fakültesi, Bahçe Bitkileri B-21", selin,
         "Steril doku kültürü çalışmaları ve kontrollü koşullarda bitki yetiştirme (iklim kabinleri)."),
        ("FEF", "Enstrümantal Analiz Lab. (Kimya)", "FEF-KIM", "Fen-Edebiyat Fakültesi, Kimya Bölümü K-110", murat,
         "Kromatografik ve spektroskopik analizler; organik bileşik tanımlama ve miktar tayini."),
        ("FEF", "Moleküler Biyoloji ve Genetik Lab.", "FEF-BIY", "Fen-Edebiyat Fakültesi, Biyoloji Bölümü B-205", murat,
         "Gen ifadesi, PCR tabanlı tanı ve floresan görüntüleme çalışmaları için BSL-2 laboratuvarı."),
        ("FEF", "Malzeme Karakterizasyon Lab. (Fizik)", "FEF-FIZ", "Fen-Edebiyat Fakültesi, Fizik Bölümü F-015", murat,
         "Elektron mikroskobu ve X-ışını kırınımı ile yüzey ve kristal yapı analizi."),
    ]
    lab_ids = {}
    for fac, name, code, room, mgr, desc in labs:
        cur = conn.execute(
            "INSERT INTO laboratories (name,code,building_room,manager_id,description,is_active,faculty_id) "
            "VALUES (?,?,?,?,?,1,?)", (name, code, room, mgr, desc, fac_ids[fac]))
        lab_ids[code] = cur.lastrowid

    # (lab, ad, marka/model, seri, durum, sertifika, ISG, gunluk saat, en kisa dk, kac gun ileri, haftalik saat, not)
    devices = [
        ("ZF-YEM", "NIR Yem Analiz Cihazı", "FOSS DS2500", "NIR-2022-0101", "active", 1, 1, 4, 30, 30, 8,
         "Örnekler 1 mm elekten öğütülmüş olmalıdır. Kalibrasyon modeli seçimi için sorumluya danışın."),
        ("ZF-YEM", "Kjeldahl Azot Analiz Sistemi", "Gerhardt Vapodest 50s + Turbotherm", "KJE-2019-0044", "active", 1, 1, 8, 60, 45, 16,
         "Derişik sülfürik asit kullanılır; çeker ocak, yüz siperi ve asit eldiveni zorunludur."),
        ("ZF-YEM", "Lif (NDF/ADF) Analizörü", "ANKOM A2000", "ANK-2021-0015", "active", 0, 1, 6, 30, 60, 0,
         "Filtre torbaları kullanıcıya aittir. Deterjan çözeltileri günlük hazırlanır."),
        ("ZF-TOP", "ICP-OES Spektrometresi", "Agilent 5110", "ICP-2023-0007", "active", 1, 1, 6, 60, 30, 12,
         "Örnekler mikrodalga yakma ile çözeltiye alınmış olmalıdır. Argon tüketimi kullanıcı projesine yazılır."),
        ("ZF-TOP", "Elementel Analizör (CHNS)", "Thermo FlashSmart", "CHN-2020-0031", "active", 1, 0, 6, 30, 30, 0,
         "Kalay kapsüller sorumludan alınır; tartım 0,01 mg hassasiyetle yapılır."),
        ("ZF-BIT", "Bitki Büyütme (İklim) Kabini", "Panasonic MLR-352H", "IKL-2021-0052", "active", 0, 0, 24, 60, 60, 0,
         "Işık-sıcaklık programı sorumlu tarafından girilir. Kabin içine toprak dökülmemelidir."),
        ("ZF-BIT", "Laminar Akış Kabini", "Nüve LN 120", "LAM-2018-0009", "active", 0, 1, 4, 30, 14, 0,
         "Kullanım öncesi 15 dakika UV ve %70 etanol ile yüzey temizliği yapılır."),
        ("FEF-KIM", "GC-MS Sistemi", "Shimadzu GCMS-QP2020 NX", "GCM-2022-0018", "active", 1, 1, 8, 60, 30, 16,
         "Kolon değişimi yalnızca sorumlu tarafından yapılır. Örnekler filtrelenmiş olmalıdır."),
        ("FEF-KIM", "HPLC Sistemi", "Agilent 1260 Infinity II", "HPLC-2020-0076", "active", 0, 1, 6, 60, 60, 0,
         "Mobil faz filtrelenmiş ve degaze edilmiş olmalıdır."),
        ("FEF-KIM", "UV-Vis Spektrofotometre", "Shimadzu UV-1900i", "UVV-2019-0120", "active", 0, 0, 4, 15, 30, 0,
         "Kuvars küvetler kullanım sonrası saf su ile durulanıp kurutulur."),
        ("FEF-BIY", "Real-Time PCR Cihazı", "Bio-Rad CFX96 Touch", "PCR-2022-0310", "active", 1, 1, 8, 60, 45, 16,
         "Plaka hazırlığı laminar kabinde yapılır. Kit ve sarf malzemesi kullanıcıya aittir."),
        ("FEF-BIY", "Floresan Mikroskop", "Zeiss Axio Imager 2", "FLM-2021-0063", "active", 1, 0, 4, 30, 30, 8,
         "Cıva lambası açıldıktan sonra en az 30 dakika kapatılmaz."),
        ("FEF-FIZ", "Taramalı Elektron Mikroskobu (SEM)", "Zeiss EVO 15 + EDS", "SEM-2021-0042", "active", 1, 1, 4, 30, 30, 8,
         "İletken olmayan numuneler altın/karbon kaplanmalıdır."),
        ("FEF-FIZ", "X-Işını Kırınım Cihazı (XRD)", "Rigaku MiniFlex 600", "XRD-2019-0027", "maintenance", 1, 1, 6, 30, 60, 0,
         "Yıllık radyasyon güvenliği ölçümü ve kalibrasyon bakımı sürüyor."),
    ]
    dev_ids = {}
    for code, name, model, serial, status, cert, isg, maxh, mn, adv, wk, notes in devices:
        cur = conn.execute(
            "INSERT INTO devices (lab_id,name,brand_model,serial_no,status,requires_certificate,requires_isg,"
            "max_daily_hours,usage_notes,min_minutes,max_advance_days,weekly_max_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (lab_ids[code], name, model, serial, status, cert, isg, maxh, notes, mn, adv, wk))
        dev_ids[serial] = cur.lastrowid

    ali = ids["ali.yilmaz@ogr.universite.edu.tr"]
    zeynep = ids["zeynep.arslan@ogr.universite.edu.tr"]
    can = ids["can.aydin@ogr.universite.edu.tr"]
    ayse = ids["ayse.koc@ogr.universite.edu.tr"]
    ahmet = ids["danisman@universite.edu.tr"]
    elif_ = ids["elif.sahin@universite.edu.tr"]
    hasan = ids["hasan.celik@universite.edu.tr"]
    nir, kje, ank = dev_ids["NIR-2022-0101"], dev_ids["KJE-2019-0044"], dev_ids["ANK-2021-0015"]
    icp, gcm, hplc, pcr = dev_ids["ICP-2023-0007"], dev_ids["GCM-2022-0018"], dev_ids["HPLC-2020-0076"], dev_ids["PCR-2022-0310"]

    # Ali Yilmaz: NIR ve Kjeldahl sertifikasi var, ICP-OES sertifikasi YOK (test icin).
    certs = [
        (ali, nir, selin, d(-60), d(305)),
        (ali, kje, selin, d(-30), d(335)),
        (ayse, icp, selin, d(-90), d(275)),
        (zeynep, pcr, murat, d(-200), d(165)),
        (can, gcm, murat, d(-45), d(320)),
    ]
    for uid, did, by, ga, ex in certs:
        conn.execute("INSERT INTO user_certificates (user_id,device_id,granted_by,granted_at,expires_at) "
                     "VALUES (?,?,?,?,?)", (uid, did, by, ga, ex))

    created = now_str()
    reservations = [
        (ali, nir, ahmet, d(-7), "10:00", "12:30", "Mısır silajında besin madde değişimi",
         "Silaj örneklerinde ham protein ve NDF tahmini", "completed", "Uygundur.", "Onaylandı.", 2.5,
         "48 örnek okundu, sonuçlar dışa aktarıldı. Cihaz normal çalışıyor."),
        (ali, ank, ahmet, d(2), "09:00", "11:00", "Yonca kuru otunda lif fraksiyonları",
         "NDF ve ADF analizi, 24 örnek", "approved", "Uygun görülmüştür.",
         "Onaylandı, deterjan çözeltileri hazır olacak.", None, None),
        (ali, nir, ahmet, d(3), "13:00", "15:00", "Mısır silajında besin madde değişimi",
         "Fermantasyonun 60. günü örnekleri", "pending_advisor", None, None, None, None),
        (ali, kje, ahmet, d(4), "10:00", "13:00", "Besi rasyonlarında ham protein doğrulaması",
         "Rasyon örneklerinde Kjeldahl ile ham protein", "pending_lab", "Tez çalışması kapsamında, onaylıyorum.",
         None, None, None),
        (zeynep, hplc, elif_, d(1), "14:00", "17:00", "Tıbbi bitki ekstraktlarında fenolik bileşikler",
         "Standart eğrisi ve numune analizi", "rejected", None,
         "İSG eğitim süreniz dolmuş; yenilendikten sonra tekrar başvurunuz.", None, None),
        (can, gcm, elif_, d(1), "09:00", "14:00", "Uçucu yağlarda bileşen analizi",
         "Kekik ve nane yağı örnekleri", "approved", "Onaylıyorum.", "Onaylandı.", None, None),
        (ayse, icp, hasan, d(5), "10:00", "14:00", "Kalecik yöresi bağ topraklarında mikro element durumu",
         "40 toprak örneğinde Fe, Zn, Mn, Cu, B", "approved", "Uygundur.", "Onaylandı, argon yeterli.", None, None),
    ]
    for r in reservations:
        conn.execute(
            "INSERT INTO reservations (user_id,device_id,advisor_id,date,start_time,end_time,project_title,purpose,"
            "status,advisor_note,lab_note,actual_hours,usage_report,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            r + (created,))

    for k, v in DEFAULT_SETTINGS.items():
        conn.execute("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)", (k, v))

    conn.execute("INSERT INTO audit_logs (user_email,action,detail,ip_address,created_at) VALUES (?,?,?,?,?)",
                 ("sistem", "KURULUM", "Veritabanı oluşturuldu ve örnek veriler yüklendi.", "-", created))


def init_db():
    is_new = not os.path.exists(DB_PATH)
    conn = connect_db()
    try:
        conn.executescript(SCHEMA)
        migrate(conn)
        if is_new or conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            seed_data(conn)
        if conn.execute("SELECT COUNT(*) FROM faculties").fetchone()[0] == 0:
            # Eski surumden gelen veritabani: iki fakulte hazir eklenir, laboratuvarlar yonetim ekranindan atanir.
            conn.executemany("INSERT INTO faculties (name, code) VALUES (?,?)",
                             [("Fen-Edebiyat Fakültesi", "FEF"), ("Ziraat Fakültesi", "ZF")])
        for k, v in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)", (k, v))
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------
# Yardimcilar
# --------------------------------------------------------------------------

_settings_cache = {"ts": 0.0, "data": {}}
_settings_lock = threading.Lock()


def get_settings(fresh=False):
    with _settings_lock:
        if fresh or time.time() - _settings_cache["ts"] > 5:
            conn = connect_db()
            try:
                rows = conn.execute("SELECT key, value FROM settings").fetchall()
            finally:
                conn.close()
            data = dict(DEFAULT_SETTINGS)
            data.update({r["key"]: (r["value"] or "") for r in rows})
            _settings_cache["data"] = data
            _settings_cache["ts"] = time.time()
        return dict(_settings_cache["data"])


def client_ip():
    return request.remote_addr or "0.0.0.0"


def audit(action, detail="", email=None, ip=None, conn=None):
    """Denetim kaydi yazar. Hata olursa uygulamayi durdurmaz."""
    try:
        if email is None:
            u = getattr(g, "user", None)
            email = u["email"] if u else "-"
        if ip is None:
            try:
                ip = client_ip()
            except RuntimeError:
                ip = "-"
        own = conn is None
        c = connect_db() if own else conn
        try:
            c.execute("INSERT INTO audit_logs (user_email,action,detail,ip_address,created_at) VALUES (?,?,?,?,?)",
                      (email, action, (detail or "")[:1000], ip, now_str()))
            if own:
                c.commit()
        finally:
            if own:
                c.close()
    except Exception as exc:  # denetim kaydi yazilamazsa bile istek devam etmeli
        app.logger.error("Denetim kaydı yazılamadı: %s", exc)


def row_dict(row):
    return dict(row) if row is not None else None


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Geçersiz istek gövdesi (JSON bekleniyor).")
    return data


def s(data, key, required=False, max_len=500, label=None):
    val = data.get(key)
    val = "" if val is None else str(val).strip()
    if required and not val:
        raise ApiError(f"'{label or key}' alanı zorunludur.")
    if len(val) > max_len:
        raise ApiError(f"'{label or key}' alanı en fazla {max_len} karakter olabilir.")
    return val


def parse_date(val, label="Tarih"):
    if not val or not DATE_RE.match(val):
        raise ApiError(f"{label} YYYY-AA-GG biçiminde olmalıdır.")
    try:
        return datetime.strptime(val, "%Y-%m-%d").date()
    except ValueError:
        raise ApiError(f"{label} geçerli bir tarih değil.")


def minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def current_user():
    return getattr(g, "user", None)


def login_required(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            user = current_user()
            if not user:
                return jsonify(error="Oturum açmanız gerekiyor."), 401
            if roles and user["role"] not in roles:
                return jsonify(error="Bu işlem için yetkiniz yok."), 403
            return fn(*a, **kw)
        return wrapper
    return deco


@app.errorhandler(ApiError)
def handle_api_error(err):
    return jsonify(error=err.message), err.status


@app.errorhandler(404)
def handle_404(_e):
    if request.path.startswith("/api/"):
        return jsonify(error="İstenen kaynak bulunamadı."), 404
    return render_template("index.html"), 200


@app.errorhandler(500)
def handle_500(_e):
    return jsonify(error="Sunucuda beklenmeyen bir hata oluştu."), 500


# --------------------------------------------------------------------------
# Ag (CIDR) filtresi, oturum ve CSRF korumasi
# --------------------------------------------------------------------------

BLOCKED_PAGE = """<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>LABNET - Erişim Engellendi</title>
<style>body{margin:0;font-family:Segoe UI,Roboto,Arial,sans-serif;background:#142D4C;color:#fff;display:flex;
min-height:100vh;align-items:center;justify-content:center;padding:16px}
.k{background:#fff;color:#142D4C;max-width:520px;width:100%;border-radius:10px;padding:32px;border-top:6px solid #1E7E74;
box-shadow:0 10px 30px rgba(0,0,0,.3)}h1{margin:12px 0 8px;font-size:22px}p{line-height:1.55;color:#33475b}
code{background:#eef3f7;padding:2px 6px;border-radius:4px}.l{font-weight:700;letter-spacing:2px;color:#1E7E74}</style>
</head><body><div class="k"><div class="l">LABNET</div>
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1E7E74" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
<h1>Erişim Engellendi (403)</h1>
<p><b>Yalnızca Kampüs Ağı veya VPN üzerinden erişilebilir.</b></p>
<p>LABNET Merkezi Laboratuvar Yönetim Sistemine yalnızca üniversite kampüs ağından (kablolu ağ, Eduroam)
veya kurumsal VPN bağlantısı üzerinden erişilebilir. Lütfen VPN bağlantınızı açıp tekrar deneyin.</p>
<p>IP adresiniz: <code>{ip}</code></p></div></body></html>"""


def ip_allowed(ip, cidrs_text):
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if getattr(addr, "ipv4_mapped", None):
        addr = addr.ipv4_mapped
    for part in cidrs_text.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if addr in ipaddress.ip_network(part, strict=False):
                return True
        except ValueError:
            continue
    return False


@app.before_request
def before_request():
    st = get_settings()
    if st.get("ip_filter_enabled") == "1":
        ip = client_ip()
        if not ip_allowed(ip, st.get("allowed_cidrs", "")):
            safe_ip = re.sub(r"[^0-9a-fA-F:.]", "", ip)
            if request.path.startswith("/api/"):
                return jsonify(error="Yalnızca Kampüs Ağı veya VPN üzerinden erişilebilir."), 403
            return BLOCKED_PAGE.replace("{ip}", safe_ip), 403, {"Content-Type": "text/html; charset=utf-8"}

    # Durum degistiren API isteklerinde ozel baslik zorunlu (siteler arasi istek sahteciligine karsi).
    if request.path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.headers.get("X-LABNET") != "1":
            return jsonify(error="Geçersiz istek kaynağı."), 400

    if request.path.startswith("/api/"):
        mark_no_shows()

    g.user = None
    uid = session.get("uid")
    if uid:
        row = get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if row and row["is_active"]:
            g.user = row
        else:
            session.clear()


_noshow_state = {"ts": 0.0}
_noshow_lock = threading.Lock()


def mark_no_shows(force=False):
    """Baslangictan N dakika sonra kullanimi baslatilmayan onayli randevulari 'gelinmedi' olarak kapatir."""
    st = get_settings()
    try:
        limit = int(st.get("noshow_minutes") or 0)
    except ValueError:
        limit = 0
    if limit <= 0:
        return
    with _noshow_lock:
        if not force and time.time() - _noshow_state["ts"] < 60:
            return
        _noshow_state["ts"] = time.time()
    now = datetime.now()
    conn = connect_db()
    try:
        rows = conn.execute(
            "SELECT r.id, r.date, r.start_time, r.end_time, d.name AS device_name, u.email, u.full_name "
            "FROM reservations r JOIN devices d ON d.id=r.device_id JOIN users u ON u.id=r.user_id "
            "WHERE r.status='approved' AND r.started_at IS NULL AND r.date<=?", (now.date().isoformat(),)).fetchall()
        for r in rows:
            start_dt = datetime.strptime(f"{r['date']} {r['start_time']}", "%Y-%m-%d %H:%M")
            if now < start_dt + timedelta(minutes=limit):
                continue
            note = f"Otomatik: randevu başlangıcından sonraki {limit} dakika içinde kullanım başlatılmadı (gelinmedi)."
            conn.execute("UPDATE reservations SET status='cancelled', no_show=1, lab_note=COALESCE(lab_note||' / ','')||? "
                         "WHERE id=? AND status='approved' AND started_at IS NULL", (note, r["id"]))
            audit("GELINMEDI", f"#{r['id']} {r['device_name']} {r['date']} {r['start_time']} - {r['email']}",
                  email="sistem", ip="-", conn=conn)
            notify(r["email"], "LABNET: Randevunuza gelinmedi olarak işaretlendi",
                   f"Sayın {r['full_name']},\n\n#{r['id']} {r['device_name']} {r['date']} {r['start_time']}-{r['end_time']} "
                   f"randevunuzda kullanım başlatılmadığı için randevu kapatıldı ve cihaz diğer kullanıcılara açıldı.")
        conn.commit()
    except Exception as exc:
        app.logger.error("Gelinmeyen randevu denetimi hatası: %s", exc)
    finally:
        conn.close()


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


# --------------------------------------------------------------------------
# LDAP
# --------------------------------------------------------------------------

def _ldap_escape(value):
    from ldap3.utils.conv import escape_filter_chars
    return escape_filter_chars(value)


def ldap_server_obj(st):
    from ldap3 import Server, ALL
    port = int(st.get("ldap_port") or 389)
    host = st.get("ldap_server", "").strip()
    use_ssl = port == 636 or host.lower().startswith("ldaps://")
    return Server(host, port=port, use_ssl=use_ssl, get_info=ALL, connect_timeout=5)


def ldap_authenticate(email, password, st):
    """LDAP ile dogrular. Basariliysa {'full_name','department'} doner, degilse None."""
    from ldap3 import Connection, SUBTREE
    if not password or not st.get("ldap_server"):
        return None
    server = ldap_server_obj(st)
    bind_dn = st.get("ldap_bind_dn", "").strip()
    bind_pass = st.get("ldap_bind_pass", "")
    base_dn = st.get("ldap_base_dn", "").strip()

    svc = Connection(server, user=bind_dn or None, password=bind_pass or None,
                     auto_bind=True, receive_timeout=8)
    try:
        esc = _ldap_escape(email)
        uid_part = _ldap_escape(email.split("@")[0])
        flt = f"(|(mail={esc})(userPrincipalName={esc})(uid={uid_part})(sAMAccountName={uid_part}))"
        svc.search(base_dn, flt, search_scope=SUBTREE,
                   attributes=["cn", "displayName", "department", "ou"], size_limit=2)
        if len(svc.entries) != 1:
            return None
        entry = svc.entries[0]
        user_dn = entry.entry_dn
        attrs = entry.entry_attributes_as_dict
    finally:
        svc.unbind()

    user_conn = Connection(server, user=user_dn, password=password, receive_timeout=8)
    try:
        if not user_conn.bind():
            return None
    finally:
        try:
            user_conn.unbind()
        except Exception as exc:
            app.logger.debug("LDAP baglantisi kapatilamadi: %s", exc)

    def first(key):
        v = attrs.get(key) or []
        return str(v[0]) if v else ""

    return {"full_name": first("displayName") or first("cn") or email,
            "department": first("department") or first("ou")}


# --------------------------------------------------------------------------
# SMTP
# --------------------------------------------------------------------------

def smtp_send(to_addrs, subject, text, st=None, raise_errors=False):
    st = st or get_settings()
    if isinstance(to_addrs, str):
        to_addrs = [to_addrs]
    to_addrs = [a for a in to_addrs if a and EMAIL_RE.match(a)]
    if not to_addrs:
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = st.get("smtp_from") or st.get("smtp_user") or "labnet@localhost"
    msg["To"] = ", ".join(to_addrs)
    msg.set_content(text + "\n\n--\nLABNET Merkezi Laboratuvar Yönetim Sistemi\nBu e-posta otomatik gönderilmiştir.")
    host = st.get("smtp_host", "").strip()
    port = int(st.get("smtp_port") or 587)
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=10, context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(host, port, timeout=10)
            server.ehlo()
            if server.has_extn("starttls"):
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
        try:
            if st.get("smtp_user"):
                server.login(st.get("smtp_user"), st.get("smtp_pass", ""))
            server.send_message(msg)
        finally:
            try:
                server.quit()
            except Exception as exc:
                app.logger.debug("SMTP baglantisi kapatilamadi: %s", exc)
    except Exception as exc:
        audit("EPOSTA_HATASI", f"{subject} -> {', '.join(to_addrs)}: {exc}", email="sistem", ip="-")
        if raise_errors:
            raise


def notify(to_addrs, subject, text):
    """SMTP aciksa e-postayi arka planda gonderir; hata uygulamayi etkilemez."""
    st = get_settings()
    if st.get("smtp_enabled") != "1" or not st.get("smtp_host"):
        return
    threading.Thread(target=smtp_send, args=(to_addrs, subject, text, st), daemon=True).start()


# --------------------------------------------------------------------------
# Sayfa ve oturum
# --------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


_failed_logins = {}
_failed_lock = threading.Lock()
MAX_FAILS, LOCK_SECONDS = 5, 300


def _login_locked(key):
    with _failed_lock:
        fails, first = _failed_logins.get(key, (0, 0))
        if fails >= MAX_FAILS and time.time() - first < LOCK_SECONDS:
            return True
        if time.time() - first >= LOCK_SECONDS:
            _failed_logins.pop(key, None)
        return False


def _login_fail(key):
    with _failed_lock:
        fails, first = _failed_logins.get(key, (0, time.time()))
        _failed_logins[key] = (fails + 1, first)


def user_public(u):
    today = date.today().isoformat()
    isg = u["isg_valid_until"]
    return {
        "id": u["id"], "full_name": u["full_name"], "email": u["email"], "role": u["role"],
        "role_label": ROLE_LABELS.get(u["role"], u["role"]), "department": u["department"],
        "isg_valid_until": isg, "isg_valid": bool(isg and isg >= today), "is_active": bool(u["is_active"]),
    }


@app.route("/api/login", methods=["POST"])
def api_login():
    data = body()
    email = s(data, "email", True, 200, "E-posta").lower()
    password = str(data.get("password") or "")
    if not password:
        raise ApiError("Şifre zorunludur.")
    key = f"{client_ip()}|{email}"
    if _login_locked(key):
        raise ApiError("Çok fazla hatalı deneme. Lütfen 5 dakika sonra tekrar deneyin.", 429)

    db = get_db()
    st = get_settings()
    user = db.execute("SELECT * FROM users WHERE lower(email)=?", (email,)).fetchone()
    method = None

    if st.get("ldap_enabled") == "1":
        try:
            info = ldap_authenticate(email, password, st)
        except Exception as exc:
            info = None
            audit("LDAP_HATASI", f"{email}: {exc}", email=email)
        if info:
            method = "LDAP"
            if user is None:
                cur = db.execute(
                    "INSERT INTO users (full_name,email,password_hash,role,department,isg_valid_until,is_active) "
                    "VALUES (?,?,?,?,?,NULL,1)",
                    (info["full_name"][:150], email, generate_password_hash(os.urandom(16).hex()),
                     "student", info["department"][:150]))
                db.commit()
                user = db.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
                audit("LDAP_YENI_KULLANICI", f"{email} LDAP ile ilk kez giriş yaptı, öğrenci olarak eklendi.",
                      email=email)

    if method is None and user is not None and check_password_hash(user["password_hash"], password):
        method = "Yerel"

    if method is None or user is None:
        _login_fail(key)
        audit("GIRIS_BASARISIZ", "Hatalı e-posta veya şifre.", email=email)
        raise ApiError("E-posta veya şifre hatalı.", 401)
    if not user["is_active"]:
        audit("GIRIS_BASARISIZ", "Pasif hesap.", email=email)
        raise ApiError("Hesabınız pasif durumda. Sistem yöneticisiyle iletişime geçin.", 403)

    with _failed_lock:
        _failed_logins.pop(key, None)
    session.clear()
    session.permanent = True
    session["uid"] = user["id"]
    g.user = user
    audit("GIRIS", f"{method} doğrulama ile giriş yapıldı.", email=user["email"])
    return jsonify(ok=True, user=user_public(user))


@app.route("/api/logout", methods=["POST"])
def api_logout():
    if current_user():
        audit("CIKIS", "Oturum kapatıldı.")
    session.clear()
    return jsonify(ok=True)


@app.route("/api/me")
def api_me():
    u = current_user()
    if not u:
        return jsonify(authenticated=False)
    out = user_public(u)
    out["authenticated"] = True
    if u["role"] == "admin":
        out["default_secret"] = SECRET_KEY == DEFAULT_SECRET
    out["managed_lab_ids"] = [r["id"] for r in get_db().execute(
        "SELECT id FROM laboratories WHERE manager_id=?", (u["id"],))]
    return jsonify(out)


@app.route("/api/me/password", methods=["POST"])
@login_required()
def api_change_password():
    data = body()
    u = current_user()
    old = str(data.get("old_password") or "")
    new = str(data.get("new_password") or "")
    if not check_password_hash(u["password_hash"], old):
        raise ApiError("Mevcut şifre hatalı.")
    if len(new) < 4:
        raise ApiError("Yeni şifre en az 4 karakter olmalıdır.")
    db = get_db()
    db.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), u["id"]))
    db.commit()
    audit("SIFRE_DEGISTI", "Kullanıcı kendi şifresini değiştirdi.")
    return jsonify(ok=True)


# --------------------------------------------------------------------------
# Gosterge paneli
# --------------------------------------------------------------------------

def pending_for_user_sql(u):
    """Kullanicinin onayina dusen taleplerin WHERE kosulu ve parametreleri."""
    if u["role"] == "admin":
        return "(r.status='pending_lab' OR r.status='pending_advisor')", []
    if u["role"] == "advisor":
        return "(r.status='pending_advisor' AND r.advisor_id=?)", [u["id"]]
    if u["role"] == "lab_manager":
        return "(r.status='pending_lab' AND l.manager_id=?)", [u["id"]]
    return "0", []


@app.route("/api/dashboard")
@login_required()
def api_dashboard():
    u = current_user()
    db = get_db()
    today = date.today().isoformat()
    month_start = date.today().replace(day=1).isoformat()

    total_devices = db.execute("SELECT COUNT(*) FROM devices d JOIN laboratories l ON l.id=d.lab_id "
                               "WHERE l.is_active=1").fetchone()[0]
    active_devices = db.execute("SELECT COUNT(*) FROM devices d JOIN laboratories l ON l.id=d.lab_id "
                                "WHERE l.is_active=1 AND d.status='active'").fetchone()[0]

    base = "FROM reservations r JOIN devices d ON d.id=r.device_id JOIN laboratories l ON l.id=d.lab_id"
    if u["role"] == "student":
        scope, params = "r.user_id=?", [u["id"]]
    elif u["role"] == "advisor":
        scope, params = "(r.advisor_id=? OR r.user_id=?)", [u["id"], u["id"]]
    elif u["role"] == "lab_manager":
        scope, params = "(l.manager_id=? OR r.user_id=?)", [u["id"], u["id"]]
    else:
        scope, params = "1", []

    active_res = db.execute(f"SELECT COUNT(*) {base} WHERE {scope} AND r.status='approved' AND r.date>=?",
                            params + [today]).fetchone()[0]
    if u["role"] == "student":
        pending = db.execute(f"SELECT COUNT(*) {base} WHERE r.user_id=? AND r.status IN "
                             "('pending_advisor','pending_lab')", [u["id"]]).fetchone()[0]
    else:
        w, p = pending_for_user_sql(u)
        pending = db.execute(f"SELECT COUNT(*) {base} WHERE {w}", p).fetchone()[0]
    hours_month = db.execute(f"SELECT COALESCE(SUM(r.actual_hours),0) {base} WHERE {scope} AND "
                             "r.status='completed' AND r.date>=?", params + [month_start]).fetchone()[0]
    completed_total = db.execute(f"SELECT COUNT(*) {base} WHERE {scope} AND r.status='completed'",
                                 params).fetchone()[0]

    upcoming = [row_dict(r) for r in db.execute(
        f"SELECT r.id, r.date, r.start_time, r.end_time, r.status, d.name AS device_name, l.name AS lab_name, "
        f"u.full_name AS user_name {base} JOIN users u ON u.id=r.user_id "
        f"WHERE {scope} AND r.date>=? AND r.status IN ('approved','pending_advisor','pending_lab') "
        "ORDER BY r.date, r.start_time LIMIT 6", params + [today])]
    for r in upcoming:
        r["status_label"] = RES_STATUS_LABELS[r["status"]]

    top_devices = [row_dict(r) for r in db.execute(
        f"SELECT d.name, COALESCE(SUM(r.actual_hours),0) AS hours, COUNT(r.id) AS cnt {base} "
        f"WHERE {scope} AND r.status='completed' GROUP BY d.id ORDER BY hours DESC LIMIT 5", params)]

    if u["role"] == "admin":
        logs = db.execute("SELECT user_email, action, detail, created_at FROM audit_logs "
                          "ORDER BY id DESC LIMIT 8").fetchall()
    else:
        logs = db.execute("SELECT user_email, action, detail, created_at FROM audit_logs WHERE user_email=? "
                          "ORDER BY id DESC LIMIT 8", (u["email"],)).fetchall()

    return jsonify(
        total_devices=total_devices, active_devices=active_devices, active_reservations=active_res,
        pending=pending, hours_month=round(hours_month, 1), completed_total=completed_total,
        upcoming=upcoming, top_devices=top_devices, recent=[row_dict(r) for r in logs])


# --------------------------------------------------------------------------
# Laboratuvarlar ve cihazlar
# --------------------------------------------------------------------------

def valid_certificate(db, user_id, device_id, on_date):
    return db.execute(
        "SELECT id, expires_at FROM user_certificates WHERE user_id=? AND device_id=? "
        "AND (expires_at IS NULL OR expires_at='' OR expires_at>=?) ORDER BY expires_at DESC LIMIT 1",
        (user_id, device_id, on_date)).fetchone()


def can_manage_lab(u, lab_id):
    if u["role"] == "admin":
        return True
    if u["role"] != "lab_manager":
        return False
    row = get_db().execute("SELECT manager_id FROM laboratories WHERE id=?", (lab_id,)).fetchone()
    return bool(row and row["manager_id"] == u["id"])


@app.route("/api/labs")
@login_required()
def api_labs():
    rows = get_db().execute(
        "SELECT l.*, u.full_name AS manager_name, u.email AS manager_email, f.name AS faculty_name, "
        "f.code AS faculty_code, (SELECT COUNT(*) FROM devices d WHERE d.lab_id=l.id) AS device_count "
        "FROM laboratories l LEFT JOIN users u ON u.id=l.manager_id LEFT JOIN faculties f ON f.id=l.faculty_id "
        "ORDER BY f.name, l.name").fetchall()
    return jsonify([row_dict(r) for r in rows])


def _faculty_param(db, raw):
    if raw in (None, "", 0, "0"):
        return None
    try:
        fid = int(raw)
    except (TypeError, ValueError):
        raise ApiError("Geçersiz fakülte.")
    if not db.execute("SELECT 1 FROM faculties WHERE id=?", (fid,)).fetchone():
        raise ApiError("Fakülte bulunamadı.")
    return fid


@app.route("/api/faculties")
@login_required()
def api_faculties():
    rows = get_db().execute(
        "SELECT f.*, (SELECT COUNT(*) FROM laboratories l WHERE l.faculty_id=f.id) AS lab_count, "
        "(SELECT COUNT(*) FROM devices d JOIN laboratories l ON l.id=d.lab_id WHERE l.faculty_id=f.id) AS device_count "
        "FROM faculties f ORDER BY f.name").fetchall()
    return jsonify([row_dict(r) for r in rows])


@app.route("/api/faculties", methods=["POST"])
@login_required("admin")
def api_faculty_create():
    data = body()
    name = s(data, "name", True, 150, "Fakülte adı")
    code = s(data, "code", True, 10, "Kısa kod").upper()
    db = get_db()
    if db.execute("SELECT 1 FROM faculties WHERE name=? OR code=?", (name, code)).fetchone():
        raise ApiError("Bu ad veya kodla kayıtlı bir fakülte zaten var.")
    db.execute("INSERT INTO faculties (name, code) VALUES (?,?)", (name, code))
    db.commit()
    audit("FAKULTE_EKLENDI", f"{code} - {name}")
    return jsonify(ok=True)


@app.route("/api/info")
def api_info():
    """Giris ekrani icin kurum adi (oturum gerektirmez)."""
    return jsonify(institution_name=get_settings().get("institution_name") or "")


@app.route("/api/labs", methods=["POST"])
@login_required("admin")
def api_lab_create():
    data = body()
    name = s(data, "name", True, 150, "Laboratuvar adı")
    code = s(data, "code", True, 20, "Kod").upper()
    manager_id = data.get("manager_id") or None
    db = get_db()
    if manager_id is not None:
        m = db.execute("SELECT role FROM users WHERE id=?", (manager_id,)).fetchone()
        if not m or m["role"] not in ("lab_manager", "admin"):
            raise ApiError("Sorumlu olarak yalnızca Lab. Sorumlusu rolündeki bir kullanıcı seçilebilir.")
    if db.execute("SELECT 1 FROM laboratories WHERE code=?", (code,)).fetchone():
        raise ApiError("Bu kodla kayıtlı bir laboratuvar zaten var.")
    faculty_id = _faculty_param(db, data.get("faculty_id"))
    db.execute("INSERT INTO laboratories (name,code,building_room,manager_id,description,is_active,faculty_id) "
               "VALUES (?,?,?,?,?,1,?)", (name, code, s(data, "building_room", max_len=150), manager_id,
                                          s(data, "description", max_len=1000), faculty_id))
    db.commit()
    audit("LAB_EKLENDI", f"{code} - {name}")
    return jsonify(ok=True)


@app.route("/api/labs/<int:lab_id>", methods=["PATCH"])
@login_required("admin")
def api_lab_update(lab_id):
    data = body()
    db = get_db()
    lab = db.execute("SELECT * FROM laboratories WHERE id=?", (lab_id,)).fetchone()
    if not lab:
        raise ApiError("Laboratuvar bulunamadı.", 404)
    manager_id = data.get("manager_id", lab["manager_id"]) or None
    if manager_id is not None:
        m = db.execute("SELECT role FROM users WHERE id=?", (manager_id,)).fetchone()
        if not m or m["role"] not in ("lab_manager", "admin"):
            raise ApiError("Sorumlu olarak yalnızca Lab. Sorumlusu rolündeki bir kullanıcı seçilebilir.")
    is_active = 1 if data.get("is_active", lab["is_active"]) else 0
    faculty_id = _faculty_param(db, data["faculty_id"]) if "faculty_id" in data else lab["faculty_id"]
    db.execute("UPDATE laboratories SET manager_id=?, is_active=?, faculty_id=? WHERE id=?",
               (manager_id, is_active, faculty_id, lab_id))
    db.commit()
    audit("LAB_GUNCELLENDI", f"{lab['code']}: sorumlu={manager_id}, aktif={is_active}, fakülte={faculty_id}")
    return jsonify(ok=True)


def device_rows(db, where="1", params=()):
    return db.execute(
        "SELECT d.*, l.name AS lab_name, l.code AS lab_code, l.building_room, l.manager_id, l.is_active AS lab_active, "
        "u.full_name AS manager_name, l.faculty_id, f.name AS faculty_name, f.code AS faculty_code "
        "FROM devices d JOIN laboratories l ON l.id=d.lab_id LEFT JOIN faculties f ON f.id=l.faculty_id "
        f"LEFT JOIN users u ON u.id=l.manager_id WHERE {where} ORDER BY l.name, d.name", params).fetchall()


@app.route("/api/devices")
@login_required()
def api_devices():
    u = current_user()
    db = get_db()
    today = date.today().isoformat()
    isg_ok = bool(u["isg_valid_until"] and u["isg_valid_until"] >= today)
    in_use = {r["device_id"]: r for r in db.execute(
        "SELECT r.device_id, r.end_time, u.full_name FROM reservations r JOIN users u ON u.id=r.user_id "
        "WHERE r.status='approved' AND r.date=? AND r.started_at IS NOT NULL AND r.ended_at IS NULL", (today,))}
    issues = {r["device_id"]: r["n"] for r in db.execute(
        "SELECT device_id, COUNT(*) AS n FROM device_issues WHERE status='open' GROUP BY device_id")}
    out = []
    for r in device_rows(db):
        dct = row_dict(r)
        if not dct["lab_active"] and u["role"] != "admin":
            continue
        dct["status_label"] = DEVICE_STATUS_LABELS[dct["status"]]
        exempt = u["role"] == "admin" or dct["manager_id"] == u["id"]
        cert = valid_certificate(db, u["id"], dct["id"], today)
        problems = []
        if dct["requires_certificate"] and not cert and not exempt:
            problems.append("Sertifika Eksik")
        if dct["requires_isg"] and not isg_ok:
            problems.append("İSG Eğitimi Geçersiz")
        dct["authorized"] = not problems
        dct["auth_problems"] = problems
        dct["cert_expires_at"] = cert["expires_at"] if cert else None
        dct["can_manage"] = can_manage_lab(u, dct["lab_id"])
        use = in_use.get(dct["id"])
        dct["in_use"] = bool(use)
        dct["in_use_until"] = use["end_time"] if use else None
        dct["in_use_by"] = use["full_name"] if use and (dct["can_manage"] or u["role"] == "admin") else None
        dct["open_issues"] = issues.get(dct["id"], 0) if dct["can_manage"] else 0
        out.append(dct)
    return jsonify(out)


def device_payload(data, partial=False, existing=None):
    out = {}
    if not partial or "name" in data:
        out["name"] = s(data, "name", True, 150, "Cihaz adı")
    for key, ml in (("brand_model", 150), ("serial_no", 80), ("usage_notes", 1500)):
        if not partial or key in data:
            out[key] = s(data, key, max_len=ml)
    if not partial or "status" in data:
        st = s(data, "status") or "active"
        if st not in DEVICE_STATUSES:
            raise ApiError("Geçersiz cihaz durumu.")
        out["status"] = st
    for key in ("requires_certificate", "requires_isg"):
        if not partial or key in data:
            out[key] = 1 if data.get(key) in (True, 1, "1", "true", "on") else 0
    if not partial or "max_daily_hours" in data:
        try:
            mh = int(data.get("max_daily_hours") or 8)
        except (TypeError, ValueError):
            raise ApiError("Günlük azami saat bir sayı olmalıdır.")
        if not 1 <= mh <= 24:
            raise ApiError("Günlük azami saat 1 ile 24 arasında olmalıdır.")
        out["max_daily_hours"] = mh
    for key, lo, hi, default, label in (("min_minutes", 5, 1440, 30, "En kısa randevu süresi (dk)"),
                                        ("max_advance_days", 1, 365, 60, "En fazla kaç gün ileriye"),
                                        ("weekly_max_hours", 0, 168, 0, "Haftalık azami saat")):
        if not partial or key in data:
            raw = data.get(key)
            try:
                val = default if raw in (None, "") else int(raw)
            except (TypeError, ValueError):
                raise ApiError(f"'{label}' bir tam sayı olmalıdır.")
            if not lo <= val <= hi:
                raise ApiError(f"'{label}' {lo} ile {hi} arasında olmalıdır.")
            out[key] = val
    if out.get("min_minutes") and out.get("max_daily_hours") and out["min_minutes"] > out["max_daily_hours"] * 60:
        raise ApiError("En kısa randevu süresi günlük azami süreden uzun olamaz.")
    return out


@app.route("/api/devices", methods=["POST"])
@login_required("admin", "lab_manager")
def api_device_create():
    data = body()
    u = current_user()
    try:
        lab_id = int(data.get("lab_id"))
    except (TypeError, ValueError):
        raise ApiError("Laboratuvar seçiniz.")
    db = get_db()
    if not db.execute("SELECT 1 FROM laboratories WHERE id=?", (lab_id,)).fetchone():
        raise ApiError("Laboratuvar bulunamadı.", 404)
    if not can_manage_lab(u, lab_id):
        raise ApiError("Yalnızca sorumlusu olduğunuz laboratuvara cihaz ekleyebilirsiniz.", 403)
    p = device_payload(data)
    cur = db.execute(
        "INSERT INTO devices (lab_id,name,brand_model,serial_no,status,requires_certificate,requires_isg,"
        "max_daily_hours,usage_notes,min_minutes,max_advance_days,weekly_max_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (lab_id, p["name"], p["brand_model"], p["serial_no"], p["status"], p["requires_certificate"],
         p["requires_isg"], p["max_daily_hours"], p["usage_notes"], p["min_minutes"], p["max_advance_days"],
         p["weekly_max_hours"]))
    db.commit()
    audit("CIHAZ_EKLENDI", f"#{cur.lastrowid} {p['name']} (lab #{lab_id})")
    return jsonify(ok=True, id=cur.lastrowid)


@app.route("/api/devices/<int:device_id>", methods=["PATCH"])
@login_required("admin", "lab_manager")
def api_device_update(device_id):
    data = body()
    u = current_user()
    db = get_db()
    dev = db.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
    if not dev:
        raise ApiError("Cihaz bulunamadı.", 404)
    if not can_manage_lab(u, dev["lab_id"]):
        raise ApiError("Bu cihazı yönetme yetkiniz yok.", 403)
    p = device_payload(data, partial=True)
    if not p:
        raise ApiError("Güncellenecek alan yok.")
    sets = ", ".join(f"{k}=?" for k in p)
    db.execute(f"UPDATE devices SET {sets} WHERE id=?", list(p.values()) + [device_id])
    db.commit()
    if "status" in p and p["status"] != dev["status"]:
        audit("CIHAZ_DURUM", f"{dev['name']}: {DEVICE_STATUS_LABELS[dev['status']]} -> "
                             f"{DEVICE_STATUS_LABELS[p['status']]}")
        if p["status"] != "active":
            # Gelecekteki onayli/bekleyen randevu sahiplerini bilgilendir.
            rows = db.execute(
                "SELECT r.date, r.start_time, u.email FROM reservations r JOIN users u ON u.id=r.user_id "
                "WHERE r.device_id=? AND r.date>=? AND r.status IN ('pending_advisor','pending_lab','approved')",
                (device_id, date.today().isoformat())).fetchall()
            for r in rows:
                notify(r["email"], f"LABNET: {dev['name']} {DEVICE_STATUS_LABELS[p['status']].lower()}",
                       f"{r['date']} {r['start_time']} tarihli randevunuzun bulunduğu cihaz "
                       f"'{DEVICE_STATUS_LABELS[p['status']]}' durumuna alındı. Lütfen laboratuvar sorumlusuyla "
                       "iletişime geçin.")
    else:
        audit("CIHAZ_GUNCELLENDI", f"{dev['name']}: {', '.join(p.keys())}")
    return jsonify(ok=True)


# --------------------------------------------------------------------------
# Kullanicilar (yonetim) ve danismanlar
# --------------------------------------------------------------------------

@app.route("/api/advisors")
@login_required()
def api_advisors():
    rows = get_db().execute("SELECT id, full_name, department FROM users WHERE role='advisor' AND is_active=1 "
                            "ORDER BY full_name").fetchall()
    return jsonify([row_dict(r) for r in rows])


@app.route("/api/users")
@login_required("admin", "lab_manager")
def api_users():
    rows = get_db().execute("SELECT * FROM users ORDER BY role, full_name").fetchall()
    u = current_user()
    if u["role"] == "admin":
        return jsonify([user_public(r) for r in rows])
    # Lab. sorumlusu sertifika atamak icin yalnizca temel bilgileri gorur.
    return jsonify([{k: v for k, v in user_public(r).items() if k in
                     ("id", "full_name", "email", "role", "role_label", "department", "isg_valid", "isg_valid_until")}
                    for r in rows if r["is_active"]])


@app.route("/api/users", methods=["POST"])
@login_required("admin")
def api_user_create():
    data = body()
    full_name = s(data, "full_name", True, 150, "Ad Soyad")
    email = s(data, "email", True, 200, "E-posta").lower()
    if not EMAIL_RE.match(email):
        raise ApiError("Geçerli bir e-posta adresi giriniz.")
    role = s(data, "role", True, 20, "Rol")
    if role not in ROLES:
        raise ApiError("Geçersiz rol.")
    password = str(data.get("password") or "")
    if len(password) < 4:
        raise ApiError("Şifre en az 4 karakter olmalıdır.")
    isg = s(data, "isg_valid_until", max_len=10)
    if isg:
        parse_date(isg, "İSG geçerlilik tarihi")
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE lower(email)=?", (email,)).fetchone():
        raise ApiError("Bu e-posta adresiyle kayıtlı bir kullanıcı zaten var.")
    db.execute("INSERT INTO users (full_name,email,password_hash,role,department,isg_valid_until,is_active) "
               "VALUES (?,?,?,?,?,?,1)", (full_name, email, generate_password_hash(password), role,
                                          s(data, "department", max_len=150), isg or None))
    db.commit()
    audit("KULLANICI_EKLENDI", f"{email} ({ROLE_LABELS[role]})")
    return jsonify(ok=True)


@app.route("/api/users/<int:user_id>", methods=["PATCH"])
@login_required("admin")
def api_user_update(user_id):
    data = body()
    db = get_db()
    target = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not target:
        raise ApiError("Kullanıcı bulunamadı.", 404)
    me = current_user()
    sets, params, changes = [], [], []
    if "full_name" in data:
        sets.append("full_name=?"); params.append(s(data, "full_name", True, 150, "Ad Soyad")); changes.append("ad")
    if "department" in data:
        sets.append("department=?"); params.append(s(data, "department", max_len=150)); changes.append("bölüm")
    if "role" in data:
        role = s(data, "role")
        if role not in ROLES:
            raise ApiError("Geçersiz rol.")
        if target["id"] == me["id"] and role != "admin":
            raise ApiError("Kendi yönetici rolünüzü kaldıramazsınız.")
        sets.append("role=?"); params.append(role); changes.append(f"rol={role}")
    if "isg_valid_until" in data:
        isg = s(data, "isg_valid_until", max_len=10)
        if isg:
            parse_date(isg, "İSG geçerlilik tarihi")
        sets.append("isg_valid_until=?"); params.append(isg or None); changes.append(f"İSG={isg or '-'}")
    if "is_active" in data:
        act = 1 if data.get("is_active") else 0
        if target["id"] == me["id"] and not act:
            raise ApiError("Kendi hesabınızı pasif yapamazsınız.")
        sets.append("is_active=?"); params.append(act); changes.append(f"aktif={act}")
    if data.get("password"):
        pw = str(data["password"])
        if len(pw) < 4:
            raise ApiError("Şifre en az 4 karakter olmalıdır.")
        sets.append("password_hash=?"); params.append(generate_password_hash(pw)); changes.append("şifre")
    if not sets:
        raise ApiError("Güncellenecek alan yok.")
    db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", params + [user_id])
    db.commit()
    audit("KULLANICI_GUNCELLENDI", f"{target['email']}: {', '.join(changes)}")
    return jsonify(ok=True)


# --------------------------------------------------------------------------
# Sertifikalar
# --------------------------------------------------------------------------

@app.route("/api/certificates")
@login_required()
def api_certificates():
    u = current_user()
    db = get_db()
    q = ("SELECT c.*, us.full_name AS user_name, us.email AS user_email, d.name AS device_name, d.lab_id, "
         "l.name AS lab_name, gb.full_name AS granted_by_name FROM user_certificates c "
         "JOIN users us ON us.id=c.user_id JOIN devices d ON d.id=c.device_id "
         "JOIN laboratories l ON l.id=d.lab_id LEFT JOIN users gb ON gb.id=c.granted_by")
    if u["role"] == "admin":
        rows = db.execute(q + " ORDER BY c.granted_at DESC").fetchall()
    elif u["role"] == "lab_manager":
        rows = db.execute(q + " WHERE l.manager_id=? OR c.user_id=? ORDER BY c.granted_at DESC",
                          (u["id"], u["id"])).fetchall()
    else:
        rows = db.execute(q + " WHERE c.user_id=? ORDER BY c.granted_at DESC", (u["id"],)).fetchall()
    today = date.today().isoformat()
    out = []
    for r in rows:
        dct = row_dict(r)
        dct["valid"] = not dct["expires_at"] or dct["expires_at"] >= today
        out.append(dct)
    return jsonify(out)


@app.route("/api/certificates", methods=["POST"])
@login_required("admin", "lab_manager")
def api_certificate_create():
    data = body()
    u = current_user()
    db = get_db()
    try:
        user_id, device_id = int(data.get("user_id")), int(data.get("device_id"))
    except (TypeError, ValueError):
        raise ApiError("Kullanıcı ve cihaz seçiniz.")
    dev = db.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
    target = db.execute("SELECT * FROM users WHERE id=? AND is_active=1", (user_id,)).fetchone()
    if not dev or not target:
        raise ApiError("Kullanıcı veya cihaz bulunamadı.", 404)
    if not can_manage_lab(u, dev["lab_id"]):
        raise ApiError("Yalnızca sorumlusu olduğunuz laboratuvarın cihazları için sertifika tanımlayabilirsiniz.", 403)
    expires = s(data, "expires_at", max_len=10)
    if expires:
        if parse_date(expires, "Geçerlilik bitişi") < date.today():
            raise ApiError("Geçerlilik bitiş tarihi bugünden önce olamaz.")
    today = date.today().isoformat()
    if valid_certificate(db, user_id, device_id, today):
        # Mevcut gecerli sertifikanin suresini guncelle.
        db.execute("UPDATE user_certificates SET expires_at=?, granted_by=?, granted_at=? WHERE user_id=? AND "
                   "device_id=? AND (expires_at IS NULL OR expires_at='' OR expires_at>=?)",
                   (expires or None, u["id"], today, user_id, device_id, today))
        action = "SERTIFIKA_YENILENDI"
    else:
        db.execute("INSERT INTO user_certificates (user_id,device_id,granted_by,granted_at,expires_at) "
                   "VALUES (?,?,?,?,?)", (user_id, device_id, u["id"], today, expires or None))
        action = "SERTIFIKA_TANIMLANDI"
    db.commit()
    audit(action, f"{target['email']} -> {dev['name']} (bitiş: {expires or 'süresiz'})")
    notify(target["email"], f"LABNET: {dev['name']} kullanım sertifikası",
           f"Sayın {target['full_name']},\n\n{dev['name']} cihazı için kullanım sertifikanız tanımlanmıştır. "
           f"Geçerlilik bitişi: {expires or 'süresiz'}.")
    return jsonify(ok=True)


@app.route("/api/certificates/<int:cert_id>", methods=["DELETE"])
@login_required("admin", "lab_manager")
def api_certificate_delete(cert_id):
    u = current_user()
    db = get_db()
    c = db.execute("SELECT c.*, d.lab_id, d.name AS device_name, us.email AS user_email FROM user_certificates c "
                   "JOIN devices d ON d.id=c.device_id JOIN users us ON us.id=c.user_id WHERE c.id=?",
                   (cert_id,)).fetchone()
    if not c:
        raise ApiError("Sertifika bulunamadı.", 404)
    if not can_manage_lab(u, c["lab_id"]):
        raise ApiError("Bu sertifikayı iptal etme yetkiniz yok.", 403)
    db.execute("DELETE FROM user_certificates WHERE id=?", (cert_id,))
    db.commit()
    audit("SERTIFIKA_IPTAL", f"{c['user_email']} -> {c['device_name']}")
    return jsonify(ok=True)


# --------------------------------------------------------------------------
# Randevular
# --------------------------------------------------------------------------

RES_SELECT = (
    "SELECT r.*, d.name AS device_name, d.lab_id, d.status AS device_status, l.name AS lab_name, "
    "l.manager_id, u.full_name AS user_name, u.email AS user_email, a.full_name AS advisor_name, "
    "m.full_name AS manager_name, (SELECT COUNT(*) FROM reservations s2 WHERE s2.series_id=r.series_id) "
    "AS series_count, fa.name AS faculty_name FROM reservations r JOIN devices d ON d.id=r.device_id "
    "JOIN laboratories l ON l.id=d.lab_id LEFT JOIN faculties fa ON fa.id=l.faculty_id JOIN users u ON u.id=r.user_id "
    "LEFT JOIN users a ON a.id=r.advisor_id LEFT JOIN users m ON m.id=l.manager_id")


def res_out(r, u):
    dct = row_dict(r)
    dct["status_label"] = RES_STATUS_LABELS[dct["status"]]
    if dct["status"] == "cancelled" and dct.get("no_show"):
        dct["status_label"] = "Gelinmedi"
    now = datetime.now()
    today = now.date().isoformat()
    owner = dct["user_id"] == u["id"]
    is_mgr = u["role"] == "admin" or dct["manager_id"] == u["id"]
    st = get_settings()
    try:
        noshow = int(st.get("noshow_minutes") or 0)
        early = int(st.get("checkin_early_minutes") or 0)
    except ValueError:
        noshow, early = 0, 15
    dct["in_progress"] = dct["status"] == "approved" and bool(dct["started_at"]) and not dct["ended_at"]
    dct["can_cancel"] = owner and (dct["status"] in ("pending_advisor", "pending_lab") or
                                   (dct["status"] == "approved" and dct["date"] >= today and not dct["started_at"]))
    # Kullanimi baslatma: randevu sahibi (veya sorumlu), randevu gunu, baslangictan 'early' dk once ile bitis arasi.
    can_start, block = False, None
    if dct["status"] == "approved" and not dct["started_at"] and (owner or is_mgr):
        if dct["date"] != today:
            block = "Kullanım yalnızca randevu gününde başlatılabilir."
        else:
            cur = now.hour * 60 + now.minute
            if cur < minutes(dct["start_time"]) - early:
                block = f"Kullanım en erken randevudan {early} dakika önce başlatılabilir."
            elif cur >= minutes(dct["end_time"]):
                block = "Randevu süresi dolmuş."
            elif dct["device_status"] != "active":
                block = "Cihaz şu anda aktif değil."
            else:
                can_start = True
    dct["can_start"] = can_start
    dct["start_block"] = block
    # Tamamlama: sorumlu her zaman; sahibi, gelinmedi denetimi aciksa once kullanimi baslatmis olmali.
    dct["can_complete"] = dct["status"] == "approved" and dct["date"] <= today and (
        is_mgr or (owner and (bool(dct["started_at"]) or noshow <= 0)))
    dct["can_advisor_decide"] = dct["status"] == "pending_advisor" and (
        dct["advisor_id"] == u["id"] or u["role"] == "admin")
    dct["can_lab_decide"] = dct["status"] == "pending_lab" and is_mgr
    return dct


def get_reservation(res_id):
    r = get_db().execute(RES_SELECT + " WHERE r.id=?", (res_id,)).fetchone()
    if not r:
        raise ApiError("Randevu bulunamadı.", 404)
    return r


@app.route("/api/reservations")
@login_required()
def api_reservations():
    u = current_user()
    db = get_db()
    scope = request.args.get("scope", "mine")
    if scope == "approvals":
        w, p = pending_for_user_sql(u)
        rows = db.execute(RES_SELECT + f" WHERE {w} ORDER BY r.date, r.start_time", p).fetchall()
    elif scope == "managed":
        if u["role"] == "admin":
            rows = db.execute(RES_SELECT + " ORDER BY r.date DESC, r.start_time DESC LIMIT 300").fetchall()
        elif u["role"] == "lab_manager":
            rows = db.execute(RES_SELECT + " WHERE l.manager_id=? ORDER BY r.date DESC, r.start_time DESC LIMIT 300",
                              (u["id"],)).fetchall()
        elif u["role"] == "advisor":
            rows = db.execute(RES_SELECT + " WHERE r.advisor_id=? ORDER BY r.date DESC, r.start_time DESC LIMIT 300",
                              (u["id"],)).fetchall()
        else:
            raise ApiError("Bu görünüm için yetkiniz yok.", 403)
    else:
        rows = db.execute(RES_SELECT + " WHERE r.user_id=? ORDER BY r.date DESC, r.start_time DESC",
                          (u["id"],)).fetchall()
    return jsonify([res_out(r, u) for r in rows])


def check_booking(db, u, dev, res_date, start, end):
    """Bir randevu adayini butun kurallara gore denetler; uymazsa ApiError firlatir."""
    res_date_s = res_date.isoformat()
    device_id = dev["id"]
    # 1) Cihaz durumu
    if dev["status"] != "active" or not dev["lab_active"]:
        raise ApiError(f"Bu cihaz şu anda '{DEVICE_STATUS_LABELS.get(dev['status'], dev['status'])}' durumunda; "
                       "randevu alınamaz.")
    # Tarih / saat kurallari
    today = date.today()
    now = datetime.now()
    if res_date < today:
        raise ApiError("Geçmiş bir tarihe randevu alınamaz.")
    if res_date > today + timedelta(days=dev["max_advance_days"]):
        raise ApiError(f"Bu cihaz için en fazla {dev['max_advance_days']} gün sonrasına randevu alınabilir.")
    if res_date == today and minutes(start) < now.hour * 60 + now.minute:
        raise ApiError("Bugün için geçmiş bir saate randevu alınamaz.")
    if minutes(end) <= minutes(start):
        raise ApiError("Bitiş saati başlangıç saatinden sonra olmalıdır.")
    dur_min = minutes(end) - minutes(start)
    duration = dur_min / 60.0
    if dur_min < dev["min_minutes"]:
        raise ApiError(f"Bu cihaz için en kısa randevu süresi {dev['min_minutes']} dakikadır.")
    if duration > dev["max_daily_hours"]:
        raise ApiError(f"Bu cihaz için günlük azami kullanım süresi {dev['max_daily_hours']} saattir.")
    active = "('pending_advisor','pending_lab','approved')"
    used = db.execute(f"SELECT start_time, end_time FROM reservations WHERE user_id=? AND device_id=? AND date=? "
                      f"AND status IN {active}", (u["id"], device_id, res_date_s)).fetchall()
    used_h = sum((minutes(r["end_time"]) - minutes(r["start_time"])) / 60.0 for r in used)
    if used_h + duration > dev["max_daily_hours"]:
        raise ApiError(f"Bu cihaz için günlük azami süre {dev['max_daily_hours']} saattir; o gün için zaten "
                       f"{used_h:g} saatlik talebiniz var.")
    if dev["weekly_max_hours"]:
        monday = res_date - timedelta(days=res_date.weekday())
        rows = db.execute(f"SELECT start_time, end_time FROM reservations WHERE user_id=? AND device_id=? AND "
                          f"date BETWEEN ? AND ? AND status IN {active}",
                          (u["id"], device_id, monday.isoformat(), (monday + timedelta(days=6)).isoformat())).fetchall()
        week_h = sum((minutes(r["end_time"]) - minutes(r["start_time"])) / 60.0 for r in rows)
        if week_h + duration > dev["weekly_max_hours"]:
            raise ApiError(f"Bu cihaz için haftalık azami süre {dev['weekly_max_hours']} saattir; o hafta için "
                           f"zaten {week_h:g} saatlik talebiniz var.")
    # 2) ISG
    if dev["requires_isg"]:
        isg = u["isg_valid_until"]
        if not isg or isg < res_date_s:
            raise ApiError("Bu cihaz İSG eğitimi gerektiriyor. İSG eğitim geçerlilik tarihiniz "
                           f"({isg or 'tanımsız'}) randevu tarihini kapsamıyor.")
    # 3) Sertifika (laboratuvarin sorumlusu ve sistem yoneticisi muaf)
    exempt = u["role"] == "admin" or dev["manager_id"] == u["id"]
    if dev["requires_certificate"] and not exempt and not valid_certificate(db, u["id"], device_id, res_date_s):
        raise ApiError("Bu cihaz için randevu tarihinde geçerli bir kullanım sertifikanız bulunmuyor. "
                       "Laboratuvar sorumlusundan sertifika talep ediniz.")
    # 4) Cakisma
    clash = db.execute(
        f"SELECT start_time, end_time FROM reservations WHERE device_id=? AND date=? AND status IN {active} "
        "AND start_time < ? AND end_time > ? LIMIT 1", (device_id, res_date_s, end, start)).fetchone()
    if clash:
        raise ApiError(f"Saat çakışması: cihaz {res_date_s} tarihinde {clash['start_time']}-{clash['end_time']} "
                       "arasında başka bir randevu için ayrılmış.", 409)


@app.route("/api/reservations", methods=["POST"])
@login_required()
def api_reservation_create():
    data = body()
    u = current_user()
    db = get_db()
    try:
        device_id = int(data.get("device_id"))
    except (TypeError, ValueError):
        raise ApiError("Cihaz seçiniz.")
    dev = db.execute("SELECT d.*, l.manager_id, l.is_active AS lab_active, l.name AS lab_name FROM devices d "
                     "JOIN laboratories l ON l.id=d.lab_id WHERE d.id=?", (device_id,)).fetchone()
    if not dev:
        raise ApiError("Cihaz bulunamadı.", 404)

    first_date = parse_date(s(data, "date", True, 10, "Tarih"))
    start, end = s(data, "start_time", True, 5, "Başlangıç saati"), s(data, "end_time", True, 5, "Bitiş saati")
    if not TIME_RE.match(start) or not TIME_RE.match(end):
        raise ApiError("Saatler SS:DD biçiminde olmalıdır.")
    project_title = s(data, "project_title", True, 200, "Proje başlığı")
    purpose = s(data, "purpose", max_len=1500)
    try:
        repeat = int(data.get("repeat_weeks") or 1)
    except (TypeError, ValueError):
        raise ApiError("Tekrar sayısı geçersiz.")
    if not 1 <= repeat <= 12:
        raise ApiError("Haftalık tekrar 1 ile 12 arasında olmalıdır.")
    skip_invalid = bool(data.get("skip_invalid"))

    # Onay akisi
    if u["role"] == "student":
        try:
            advisor_id = int(data.get("advisor_id"))
        except (TypeError, ValueError):
            raise ApiError("Akademik danışman seçiniz.")
        adv = db.execute("SELECT * FROM users WHERE id=? AND role='advisor' AND is_active=1",
                         (advisor_id,)).fetchone()
        if not adv:
            raise ApiError("Seçilen kişi aktif bir akademik danışman değil.")
        status = "pending_advisor"
    else:
        # Personel talepleri danisman asamasini atlar, dogrudan laboratuvar onayina gider.
        advisor_id, adv = u["id"], None
        status = "pending_lab"

    series_id = uuid.uuid4().hex[:12] if repeat > 1 else None
    created, failures = [], []
    for i in range(repeat):
        d_i = first_date + timedelta(weeks=i)
        try:
            check_booking(db, u, dev, d_i, start, end)
        except ApiError as err:
            if repeat == 1:
                raise
            failures.append({"date": d_i.isoformat(), "error": err.message})
            continue
        cur = db.execute(
            "INSERT INTO reservations (user_id,device_id,advisor_id,date,start_time,end_time,project_title,purpose,"
            "status,created_at,series_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (u["id"], device_id, advisor_id, d_i.isoformat(), start, end, project_title, purpose, status,
             now_str(), series_id))
        created.append((cur.lastrowid, d_i.isoformat()))

    if failures and (not skip_invalid or not created):
        db.rollback()
        msg = ("Tekrarlanan randevuların hiçbir tarihi uygun değil." if len(failures) == repeat
               else "Tekrarlanan randevuların bazı tarihleri uygun değil.")
        return jsonify(error=msg, failures=failures, possible=repeat - len(failures)), 409
    db.commit()

    ids = [c[0] for c in created]
    dates = ", ".join(c[1] for c in created)
    audit("RANDEVU_OLUSTUR", f"#{', #'.join(map(str, ids))} {dev['name']} {dates} {start}-{end}"
          + (f" (seri, {len(ids)} hafta)" if series_id else ""))

    info = (f"Talep No: #{', #'.join(map(str, ids))}\nTalep Eden: {u['full_name']}\nCihaz: {dev['name']} "
            f"({dev['lab_name']})\nTarih: {dates}\nSaat: {start}-{end}\nProje: {project_title}\nAmaç: {purpose or '-'}")
    if adv:
        notify(adv["email"], "LABNET: Onayınızı bekleyen randevu talebi",
               f"Sayın {adv['full_name']},\n\nDanışmanı olduğunuz öğrencinin yeni bir cihaz randevu talebi "
               f"onayınızı bekliyor.\n\n{info}")
    else:
        mgr = db.execute("SELECT email FROM users WHERE id=?", (dev["manager_id"],)).fetchone()
        if mgr:
            notify(mgr["email"], "LABNET: Onayınızı bekleyen randevu talebi", info)
    return jsonify(ok=True, id=ids[0], ids=ids, series_id=series_id, skipped=failures, status=status,
                   status_label=RES_STATUS_LABELS[status])


def _decision(data):
    decision = s(data, "decision", True, 10, "Karar")
    if decision not in ("approve", "reject"):
        raise ApiError("Geçersiz karar.")
    note = s(data, "note", max_len=1000)
    if decision == "reject" and not note:
        raise ApiError("Reddetme işleminde gerekçe notu zorunludur.")
    return decision, note, bool(data.get("series"))


def _series_targets(r, status):
    """Seri secildiyse ayni seride ayni asamada bekleyen randevular, degilse yalnizca kendisi."""
    if not r["series_id"]:
        return [r]
    return get_db().execute(RES_SELECT + " WHERE r.series_id=? AND r.status=? ORDER BY r.date",
                            (r["series_id"], status)).fetchall()


@app.route("/api/reservations/<int:res_id>/advisor", methods=["POST"])
@login_required("advisor", "admin")
def api_res_advisor(res_id):
    u = current_user()
    decision, note, series = _decision(body())
    r = get_reservation(res_id)
    if r["status"] != "pending_advisor":
        raise ApiError("Bu talep danışman onayı aşamasında değil.")
    if r["advisor_id"] != u["id"] and u["role"] != "admin":
        raise ApiError("Bu talep size atanmamış.", 403)
    targets = _series_targets(r, "pending_advisor") if series else [r]
    new_status = "pending_lab" if decision == "approve" else "rejected"
    db = get_db()
    for t in targets:
        db.execute("UPDATE reservations SET status=?, advisor_note=? WHERE id=? AND status='pending_advisor'",
                   (new_status, note, t["id"]))
    db.commit()
    ids = ", ".join(f"#{t['id']}" for t in targets)
    dates = ", ".join(t["date"] for t in targets)
    audit("DANISMAN_" + ("ONAY" if decision == "approve" else "RET"), f"{ids} {r['device_name']} - {note}")
    head = f"{ids} {r['device_name']} {dates} {r['start_time']}-{r['end_time']}"
    if decision == "approve":
        notify(r["user_email"], "LABNET: Talebiniz danışman tarafından onaylandı",
               f"{head}\n\nTalebiniz danışmanınız tarafından onaylandı ve laboratuvar sorumlusu onayına iletildi."
               f"\nNot: {note or '-'}")
        mgr = db.execute("SELECT email FROM users WHERE id=?", (r["manager_id"],)).fetchone()
        if mgr:
            notify(mgr["email"], "LABNET: Onayınızı bekleyen randevu talebi",
                   f"{head}\nTalep eden: {r['user_name']}\nProje: {r['project_title']}\n\n"
                   "Danışman onayı tamamlandı, laboratuvar onayınızı bekliyor.")
    else:
        notify(r["user_email"], "LABNET: Talebiniz reddedildi",
               f"{head}\n\nTalebiniz danışmanınız tarafından reddedildi.\nGerekçe: {note}")
    return jsonify(ok=True, status=new_status, count=len(targets))


@app.route("/api/reservations/<int:res_id>/lab", methods=["POST"])
@login_required("lab_manager", "admin")
def api_res_lab(res_id):
    u = current_user()
    decision, note, series = _decision(body())
    r = get_reservation(res_id)
    if r["status"] != "pending_lab":
        raise ApiError("Bu talep laboratuvar onayı aşamasında değil.")
    if r["manager_id"] != u["id"] and u["role"] != "admin":
        raise ApiError("Bu laboratuvarın sorumlusu değilsiniz.", 403)
    if decision == "approve" and r["device_status"] != "active":
        raise ApiError("Cihaz şu anda aktif değil; talep onaylanamaz.")
    targets = _series_targets(r, "pending_lab") if series else [r]
    new_status = "approved" if decision == "approve" else "rejected"
    db = get_db()
    for t in targets:
        db.execute("UPDATE reservations SET status=?, lab_note=? WHERE id=? AND status='pending_lab'",
                   (new_status, note, t["id"]))
    db.commit()
    ids = ", ".join(f"#{t['id']}" for t in targets)
    dates = ", ".join(t["date"] for t in targets)
    audit("LAB_" + ("ONAY" if decision == "approve" else "RET"), f"{ids} {r['device_name']} - {note}")
    head = f"{ids} {r['device_name']} {dates} {r['start_time']}-{r['end_time']}"
    if decision == "approve":
        notify(r["user_email"], "LABNET: Randevunuz onaylandı",
               f"{head}\n\nRandevunuz laboratuvar sorumlusu tarafından onaylandı.\nNot: {note or '-'}")
    else:
        notify(r["user_email"], "LABNET: Talebiniz reddedildi",
               f"{head}\n\nTalebiniz laboratuvar sorumlusu tarafından reddedildi.\nGerekçe: {note}")
    return jsonify(ok=True, status=new_status, count=len(targets))


@app.route("/api/reservations/<int:res_id>/cancel", methods=["POST"])
@login_required()
def api_res_cancel(res_id):
    u = current_user()
    data = request.get_json(silent=True) or {}
    r = get_reservation(res_id)
    if not res_out(r, u)["can_cancel"]:
        raise ApiError("Bu randevu iptal edilemez.")
    db = get_db()
    targets = [r]
    if data.get("series") and r["series_id"]:
        rows = db.execute(RES_SELECT + " WHERE r.series_id=? AND r.date>=? ORDER BY r.date",
                          (r["series_id"], r["date"])).fetchall()
        targets = [x for x in rows if res_out(x, u)["can_cancel"]]
    for t in targets:
        db.execute("UPDATE reservations SET status='cancelled' WHERE id=?", (t["id"],))
    db.commit()
    ids = ", ".join(f"#{t['id']}" for t in targets)
    audit("RANDEVU_IPTAL", f"{ids} {r['device_name']} {', '.join(t['date'] for t in targets)} {r['start_time']}")
    to = []
    if r["status"] == "pending_advisor" and r["advisor_id"] != u["id"]:
        a = db.execute("SELECT email FROM users WHERE id=?", (r["advisor_id"],)).fetchone()
        to.append(a["email"] if a else None)
    elif r["status"] in ("pending_lab", "approved"):
        m = db.execute("SELECT email FROM users WHERE id=?", (r["manager_id"],)).fetchone()
        to.append(m["email"] if m else None)
    notify(to, "LABNET: Randevu iptal edildi",
           f"{ids} {r['device_name']} {', '.join(t['date'] for t in targets)} {r['start_time']}-{r['end_time']} "
           f"randevusu {r['user_name']} tarafından iptal edildi.")
    return jsonify(ok=True, count=len(targets))


@app.route("/api/reservations/<int:res_id>/start", methods=["POST"])
@login_required()
def api_res_start(res_id):
    u = current_user()
    r = get_reservation(res_id)
    info = res_out(r, u)
    if not info["can_start"]:
        raise ApiError(info.get("start_block") or "Bu randevu için kullanım şu anda başlatılamaz.")
    db = get_db()
    db.execute("UPDATE reservations SET started_at=? WHERE id=? AND started_at IS NULL", (now_str(), res_id))
    db.commit()
    audit("KULLANIM_BASLADI", f"#{res_id} {r['device_name']} ({r['user_name']})")
    return jsonify(ok=True, started_at=now_str())


@app.route("/api/reservations/<int:res_id>/complete", methods=["POST"])
@login_required()
def api_res_complete(res_id):
    u = current_user()
    data = body()
    r = get_reservation(res_id)
    if r["status"] != "approved":
        raise ApiError("Yalnızca onaylı randevular tamamlanabilir.")
    if not res_out(r, u)["can_complete"]:
        if r["date"] > date.today().isoformat():
            raise ApiError("Randevu tarihi gelmeden kullanım raporu girilemez.")
        if r["user_id"] == u["id"] and not r["started_at"]:
            raise ApiError("Önce cihazın başında 'Kullanımı Başlat' düğmesine basmalısınız.")
        raise ApiError("Bu randevuyu tamamlama yetkiniz yok.", 403)
    try:
        hours = float(str(data.get("actual_hours", "")).replace(",", "."))
    except ValueError:
        raise ApiError("Gerçekleşen kullanım süresi sayı olmalıdır.")
    if not 0 < hours <= 24:
        raise ApiError("Gerçekleşen kullanım süresi 0 ile 24 saat arasında olmalıdır.")
    report = s(data, "usage_report", True, 2000, "Kullanım raporu / cihaz durum notu")
    problem = bool(data.get("device_problem"))
    if problem:
        report = "[CİHAZDA SORUN BİLDİRİLDİ] " + report
    db = get_db()
    now = datetime.now()
    ended = now_str()
    new_end = r["end_time"]
    # Erken bitirilen kullanimda kalan sure diger kullanicilara acilir.
    if r["started_at"] and r["date"] == now.date().isoformat():
        cur_min = now.hour * 60 + now.minute + (1 if now.second else 0)
        if minutes(r["start_time"]) < cur_min < minutes(r["end_time"]):
            new_end = f"{cur_min // 60:02d}:{cur_min % 60:02d}"
    db.execute("UPDATE reservations SET status='completed', actual_hours=?, usage_report=?, ended_at=?, end_time=? "
               "WHERE id=?", (round(hours, 2), report, ended, new_end, res_id))
    if problem:
        db.execute("INSERT INTO device_issues (device_id,user_id,description,status,created_at) VALUES (?,?,?,?,?)",
                   (r["device_id"], u["id"], f"#{res_id} kullanım raporundan: {report}", "open", ended))
    db.commit()
    freed = f" Erken bitirildi, {new_end}-{r['end_time']} arası serbest bırakıldı." if new_end != r["end_time"] else ""
    audit("RANDEVU_TAMAMLANDI", f"#{res_id} {r['device_name']} {hours:g} saat" +
          (" - SORUN BİLDİRİLDİ" if problem else "") + freed)
    if problem:
        m = db.execute("SELECT email FROM users WHERE id=?", (r["manager_id"],)).fetchone()
        if m:
            notify(m["email"], f"LABNET: {r['device_name']} için sorun bildirimi",
                   f"#{res_id} {r['date']} {r['start_time']}-{r['end_time']} kullanımında {r['user_name']} "
                   f"cihazla ilgili sorun bildirdi:\n\n{report}")
    return jsonify(ok=True, freed=bool(freed))


@app.route("/api/calendar")
@login_required()
def api_calendar():
    u = current_user()
    db = get_db()
    start_s = request.args.get("start") or date.today().isoformat()
    start = parse_date(start_s, "Başlangıç tarihi")
    try:
        days = max(1, min(int(request.args.get("days", 7)), 31))
    except ValueError:
        days = 7
    end = start + timedelta(days=days - 1)
    params = [start.isoformat(), end.isoformat()]
    where = "r.date BETWEEN ? AND ? AND r.status IN ('pending_advisor','pending_lab','approved','completed')"
    if request.args.get("device_id"):
        try:
            params.append(int(request.args["device_id"]))
        except ValueError:
            raise ApiError("Geçersiz cihaz.")
        where += " AND r.device_id=?"
    elif request.args.get("lab_id"):
        try:
            params.append(int(request.args["lab_id"]))
        except ValueError:
            raise ApiError("Geçersiz laboratuvar.")
        where += " AND d.lab_id=?"
    rows = db.execute(RES_SELECT + f" WHERE {where} ORDER BY r.date, r.start_time", params).fetchall()
    out = []
    for r in rows:
        mine = r["user_id"] == u["id"]
        staff = u["role"] == "admin" or r["manager_id"] == u["id"] or r["advisor_id"] == u["id"]
        item = {"id": r["id"], "date": r["date"], "start_time": r["start_time"], "end_time": r["end_time"],
                "status": r["status"], "status_label": RES_STATUS_LABELS[r["status"]],
                "device_id": r["device_id"], "device_name": r["device_name"], "mine": mine,
                "in_progress": r["status"] == "approved" and bool(r["started_at"]) and not r["ended_at"]}
        if mine or staff:
            item["user_name"] = r["user_name"]
            item["project_title"] = r["project_title"]
        out.append(item)
    return jsonify(start=start.isoformat(), days=days, items=out)


# --------------------------------------------------------------------------
# Ariza bildirimleri
# --------------------------------------------------------------------------

@app.route("/api/devices/<int:device_id>/issues", methods=["POST"])
@login_required()
def api_issue_create(device_id):
    u = current_user()
    data = body()
    text = s(data, "description", True, 1500, "Arıza açıklaması")
    db = get_db()
    dev = db.execute("SELECT d.*, l.manager_id FROM devices d JOIN laboratories l ON l.id=d.lab_id WHERE d.id=?",
                     (device_id,)).fetchone()
    if not dev:
        raise ApiError("Cihaz bulunamadı.", 404)
    cur = db.execute("INSERT INTO device_issues (device_id,user_id,description,status,created_at) VALUES (?,?,?,?,?)",
                     (device_id, u["id"], text, "open", now_str()))
    db.commit()
    audit("ARIZA_BILDIRIMI", f"#{cur.lastrowid} {dev['name']}: {text}")
    mgr = db.execute("SELECT email FROM users WHERE id=?", (dev["manager_id"],)).fetchone()
    if mgr:
        notify(mgr["email"], f"LABNET: {dev['name']} için arıza bildirimi",
               f"Bildiren: {u['full_name']} ({u['email']})\nCihaz: {dev['name']} ({dev['serial_no'] or '-'})\n\n{text}")
    return jsonify(ok=True, id=cur.lastrowid)


@app.route("/api/issues")
@login_required()
def api_issues():
    u = current_user()
    db = get_db()
    q = ("SELECT i.*, d.name AS device_name, d.status AS device_status, l.name AS lab_name, l.manager_id, "
         "us.full_name AS user_name, rb.full_name AS resolved_by_name FROM device_issues i "
         "JOIN devices d ON d.id=i.device_id JOIN laboratories l ON l.id=d.lab_id JOIN users us ON us.id=i.user_id "
         "LEFT JOIN users rb ON rb.id=i.resolved_by")
    if u["role"] == "admin":
        rows = db.execute(q + " ORDER BY i.status, i.id DESC LIMIT 300").fetchall()
    elif u["role"] == "lab_manager":
        rows = db.execute(q + " WHERE l.manager_id=? OR i.user_id=? ORDER BY i.status, i.id DESC LIMIT 300",
                          (u["id"], u["id"])).fetchall()
    else:
        rows = db.execute(q + " WHERE i.user_id=? ORDER BY i.id DESC LIMIT 100", (u["id"],)).fetchall()
    out = []
    for r in rows:
        dct = row_dict(r)
        dct["can_resolve"] = dct["status"] == "open" and (u["role"] == "admin" or dct["manager_id"] == u["id"])
        out.append(dct)
    return jsonify(out)


@app.route("/api/issues/<int:issue_id>", methods=["PATCH"])
@login_required("admin", "lab_manager")
def api_issue_resolve(issue_id):
    u = current_user()
    data = body()
    db = get_db()
    i = db.execute("SELECT i.*, d.name AS device_name, d.lab_id, us.email AS user_email FROM device_issues i "
                   "JOIN devices d ON d.id=i.device_id JOIN users us ON us.id=i.user_id WHERE i.id=?",
                   (issue_id,)).fetchone()
    if not i:
        raise ApiError("Arıza kaydı bulunamadı.", 404)
    if not can_manage_lab(u, i["lab_id"]):
        raise ApiError("Bu kaydı kapatma yetkiniz yok.", 403)
    if i["status"] != "open":
        raise ApiError("Bu kayıt zaten kapatılmış.")
    note = s(data, "resolution_note", True, 1000, "Çözüm notu")
    db.execute("UPDATE device_issues SET status='resolved', resolution_note=?, resolved_by=?, resolved_at=? WHERE id=?",
               (note, u["id"], now_str(), issue_id))
    db.commit()
    audit("ARIZA_KAPATILDI", f"#{issue_id} {i['device_name']}: {note}")
    notify(i["user_email"], f"LABNET: {i['device_name']} arıza bildiriminiz kapatıldı",
           f"#{issue_id} numaralı bildiriminiz kapatıldı.\nÇözüm notu: {note}")
    return jsonify(ok=True)


# --------------------------------------------------------------------------
# Kullanim raporlari ve Excel aktarimi
# --------------------------------------------------------------------------

REPORT_GROUPS = {"faculty": "Fakülte", "device": "Cihaz", "lab": "Laboratuvar", "advisor": "Danışman", "user": "Kullanıcı", "month": "Ay"}
MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim",
             "Kasım", "Aralık"]


def report_data():
    u = current_user()
    if u["role"] == "student":
        raise ApiError("Raporları görüntüleme yetkiniz yok.", 403)
    today = date.today()
    d_from = parse_date(request.args.get("from") or today.replace(day=1).isoformat(), "Başlangıç tarihi")
    d_to = parse_date(request.args.get("to") or today.isoformat(), "Bitiş tarihi")
    if d_to < d_from:
        raise ApiError("Bitiş tarihi başlangıç tarihinden önce olamaz.")
    group = request.args.get("group") or "device"
    if group not in REPORT_GROUPS:
        raise ApiError("Geçersiz gruplama.")
    where, params = "r.date BETWEEN ? AND ?", [d_from.isoformat(), d_to.isoformat()]
    if u["role"] == "lab_manager":
        where += " AND l.manager_id=?"; params.append(u["id"])
    elif u["role"] == "advisor":
        where += " AND r.advisor_id=? AND r.user_id<>?"; params += [u["id"], u["id"]]
    if request.args.get("lab_id"):
        where += " AND d.lab_id=?"; params.append(int(request.args["lab_id"]))
    if request.args.get("faculty_id"):
        where += " AND l.faculty_id=?"; params.append(int(request.args["faculty_id"]))
    rows = get_db().execute(RES_SELECT + f" WHERE {where} ORDER BY r.date, r.start_time", params).fetchall()

    def key_of(r):
        if group == "faculty":
            return r["faculty_name"] or "(Fakülte atanmamış)"
        if group == "device":
            return r["device_name"]
        if group == "lab":
            return r["lab_name"]
        if group == "advisor":
            return r["advisor_name"] if r["advisor_id"] != r["user_id"] else "(Personel talebi)"
        if group == "user":
            return r["user_name"]
        y, m = r["date"][:4], int(r["date"][5:7])
        return f"{y}-{m:02d} {MONTHS_TR[m - 1]}"

    agg = {}
    for r in rows:
        k = key_of(r) or "-"
        a = agg.setdefault(k, {"key": k, "requests": 0, "completed": 0, "hours": 0.0, "planned_hours": 0.0,
                               "upcoming": 0, "no_show": 0, "cancelled": 0, "rejected": 0, "pending": 0})
        a["requests"] += 1
        dur = (minutes(r["end_time"]) - minutes(r["start_time"])) / 60.0
        if r["status"] == "completed":
            a["completed"] += 1
            a["hours"] += r["actual_hours"] or 0
            a["planned_hours"] += dur
        elif r["status"] == "approved":
            a["upcoming"] += 1
            a["planned_hours"] += dur
        elif r["status"] == "cancelled":
            a["no_show" if r["no_show"] else "cancelled"] += 1
        elif r["status"] == "rejected":
            a["rejected"] += 1
        else:
            a["pending"] += 1
    summary = sorted(agg.values(), key=lambda x: x["key"] if group == "month" else -x["hours"])
    for a in summary:
        a["hours"] = round(a["hours"], 2)
        a["planned_hours"] = round(a["planned_hours"], 2)
        a["no_show_rate"] = round(100.0 * a["no_show"] / (a["completed"] + a["no_show"]), 1) \
            if (a["completed"] + a["no_show"]) else 0.0
    totals = {k: round(sum(a[k] for a in summary), 2) for k in
              ("requests", "completed", "hours", "planned_hours", "upcoming", "no_show", "cancelled", "rejected",
               "pending")}
    details = [{"id": r["id"], "date": r["date"], "start_time": r["start_time"], "end_time": r["end_time"],
                "device_name": r["device_name"], "lab_name": r["lab_name"], "user_name": r["user_name"],
                "faculty_name": r["faculty_name"] or "",
                "advisor_name": r["advisor_name"] if r["advisor_id"] != r["user_id"] else "",
                "project_title": r["project_title"],
                "status": "Gelinmedi" if (r["status"] == "cancelled" and r["no_show"]) else RES_STATUS_LABELS[r["status"]],
                "actual_hours": r["actual_hours"]} for r in rows]
    return {"from": d_from.isoformat(), "to": d_to.isoformat(), "group": group, "group_label": REPORT_GROUPS[group],
            "summary": summary, "totals": totals, "details": details}


@app.route("/api/reports/usage")
@login_required()
def api_report_usage():
    return jsonify(report_data())


def _col(n):
    out = ""
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def build_xlsx(sheets):
    """Harici kutuphane olmadan basit bir .xlsx (Office Open XML) dosyasi uretir.
    sheets: [(ad, basliklar, satirlar, sutun_genislikleri)]"""
    def cell(ref, v, style=0):
        st = f' s="{style}"' if style else ""
        if isinstance(v, bool):
            v = "Evet" if v else "Hayır"
        if isinstance(v, (int, float)):
            return f'<c r="{ref}"{st}><v>{v}</v></c>'
        if v is None or v == "":
            return f'<c r="{ref}"{st}/>'
        return f'<c r="{ref}" t="inlineStr"{st}><is><t xml:space="preserve">{xml_escape(str(v))}</t></is></c>'

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                   + "".join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                             for i in range(len(sheets))) + '</Types>')
        z.writestr("_rels/.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                   '</Relationships>')
        z.writestr("xl/workbook.xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + "".join(f'<sheet name="{xml_escape(name[:31])}" sheetId="{i + 1}" r:id="rId{i + 1}"/>'
                             for i, (name, *_r) in enumerate(sheets)) + '</sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + "".join(f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>'
                             for i in range(len(sheets)))
                   + f'<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                   '</Relationships>')
        # 0: normal, 1: kalin beyaz baslik lacivert zemin, 2: ondalik sayi, 3: kalin toplam satiri
        z.writestr("xl/styles.xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                   '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
                   '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>'
                   '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
                   '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
                   '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
                   '<fill><patternFill patternType="solid"><fgColor rgb="FF142D4C"/><bgColor indexed="64"/></patternFill></fill>'
                   '<fill><patternFill patternType="solid"><fgColor rgb="FFE3F3F1"/><bgColor indexed="64"/></patternFill></fill></fills>'
                   '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
                   '<border><left style="thin"><color rgb="FFD0D7E0"/></left><right style="thin"><color rgb="FFD0D7E0"/></right>'
                   '<top style="thin"><color rgb="FFD0D7E0"/></top><bottom style="thin"><color rgb="FFD0D7E0"/></bottom><diagonal/></border></borders>'
                   '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                   '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
                   '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
                   '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>'
                   '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
                   '<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'
                   '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')
        for i, (name, headers, rows, widths, *rest) in enumerate(sheets):
            total_row = rest[0] if rest else None
            xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                   '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
                   '<cols>' + "".join(f'<col min="{j + 1}" max="{j + 1}" width="{w}" customWidth="1"/>'
                                      for j, w in enumerate(widths)) + '</cols><sheetData>']
            xml.append('<row r="1">' + "".join(cell(f"{_col(j + 1)}1", h, 1) for j, h in enumerate(headers)) + '</row>')
            all_rows = list(rows) + ([total_row] if total_row else [])
            for ri, row in enumerate(all_rows, start=2):
                is_total = total_row is not None and ri == len(all_rows) + 1
                cells = []
                for j, v in enumerate(row):
                    style = (4 if isinstance(v, float) else 3) if is_total else (2 if isinstance(v, float) else 0)
                    cells.append(cell(f"{_col(j + 1)}{ri}", v, style))
                xml.append(f'<row r="{ri}">' + "".join(cells) + '</row>')
            last = _col(len(headers)) + str(len(rows) + 1)
            xml.append(f'</sheetData><autoFilter ref="A1:{last}"/></worksheet>' if rows else '</sheetData></worksheet>')
            z.writestr(f"xl/worksheets/sheet{i + 1}.xml", "".join(xml))
    return buf.getvalue()


@app.route("/api/reports/usage.xlsx")
@login_required()
def api_report_usage_xlsx():
    d = report_data()
    sum_headers = [d["group_label"], "Talep", "Tamamlanan", "Gerçekleşen Saat", "Planlanan Saat", "Yaklaşan Onaylı",
                   "Gelinmedi", "Gelinmeme Oranı (%)", "İptal", "Red", "Onay Bekleyen"]
    sum_rows = [[a["key"], a["requests"], a["completed"], float(a["hours"]), float(a["planned_hours"]), a["upcoming"],
                 a["no_show"], float(a["no_show_rate"]), a["cancelled"], a["rejected"], a["pending"]] for a in d["summary"]]
    t = d["totals"]
    total = ["TOPLAM", int(t["requests"]), int(t["completed"]), float(t["hours"]), float(t["planned_hours"]),
             int(t["upcoming"]), int(t["no_show"]),
             float(round(100.0 * t["no_show"] / (t["completed"] + t["no_show"]), 1) if (t["completed"] + t["no_show"]) else 0.0),
             int(t["cancelled"]), int(t["rejected"]), int(t["pending"])]
    det_headers = ["No", "Tarih", "Başlangıç", "Bitiş", "Fakülte", "Cihaz", "Laboratuvar", "Kullanıcı", "Danışman",
                   "Proje", "Durum", "Gerçekleşen Saat"]
    det_rows = [[x["id"], x["date"], x["start_time"], x["end_time"], x["faculty_name"], x["device_name"], x["lab_name"],
                 x["user_name"],
                 x["advisor_name"], x["project_title"], x["status"],
                 float(x["actual_hours"]) if x["actual_hours"] is not None else ""] for x in d["details"]]
    data = build_xlsx([
        ("Özet", sum_headers, sum_rows, [34, 9, 12, 16, 15, 15, 11, 18, 8, 8, 14], total),
        ("Ayrıntı", det_headers, det_rows, [7, 12, 10, 9, 24, 32, 34, 22, 24, 40, 26, 16]),
    ])
    audit("RAPOR_INDIRILDI", f"Kullanım raporu {d['from']} - {d['to']} ({d['group_label']})")
    name = f"labnet-kullanim-{d['from']}_{d['to']}.xlsx"
    return send_file(BytesIO(data), as_attachment=True, download_name=name,
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# --------------------------------------------------------------------------
# Sistem yonetimi
# --------------------------------------------------------------------------

@app.route("/api/admin/settings")
@login_required("admin")
def api_settings_get():
    st = get_settings(fresh=True)
    out = {k: v for k, v in st.items() if k not in SECRET_SETTINGS}
    for k in SECRET_SETTINGS:
        out[k] = ""
        out[k + "_set"] = bool(st.get(k))
    out["client_ip"] = client_ip()
    out["default_secret"] = SECRET_KEY == DEFAULT_SECRET
    return jsonify(out)


def _validate_cidrs(text):
    parts = [p.strip() for p in text.split(",") if p.strip()]
    if not parts:
        raise ApiError("En az bir IP bloğu (CIDR) giriniz.")
    norm = []
    for p in parts:
        try:
            norm.append(str(ipaddress.ip_network(p, strict=False)))
        except ValueError:
            raise ApiError(f"Geçersiz IP bloğu: {p}")
    return ",".join(norm)


@app.route("/api/admin/settings", methods=["PUT"])
@login_required("admin")
def api_settings_put():
    data = body()
    current = get_settings(fresh=True)
    new = {}
    for key in DEFAULT_SETTINGS:
        if key not in data:
            continue
        val = data.get(key)
        if key in ("ip_filter_enabled", "ldap_enabled", "smtp_enabled"):
            val = "1" if val in (True, 1, "1", "true", "on") else "0"
        else:
            val = "" if val is None else str(val).strip()
        if key in SECRET_SETTINGS and val == "" and not data.get(key + "_clear"):
            continue  # bos birakildiysa mevcut parolayi koru
        if key in ("noshow_minutes", "checkin_early_minutes"):
            if not val.isdigit() or not 0 <= int(val) <= 240:
                raise ApiError("Dakika değerleri 0 ile 240 arasında bir sayı olmalıdır.")
        if key in ("ldap_port", "smtp_port"):
            if not val.isdigit() or not 1 <= int(val) <= 65535:
                raise ApiError("Port 1-65535 arasında bir sayı olmalıdır.")
        if key == "allowed_cidrs":
            val = _validate_cidrs(val)
        if key == "institution_name" and len(val) > 150:
            raise ApiError("Kurum adı en fazla 150 karakter olabilir.")
        if key == "smtp_from" and val and not EMAIL_RE.match(val):
            raise ApiError("Gönderen e-posta adresi geçerli değil.")
        if len(val) > 2000:
            raise ApiError(f"{key} değeri çok uzun.")
        new[key] = val

    merged = dict(current)
    merged.update(new)
    if merged.get("ip_filter_enabled") == "1" and not ip_allowed(client_ip(), merged.get("allowed_cidrs", "")):
        raise ApiError(f"Bu ayarla kendi IP adresiniz ({client_ip()}) engellenecekti. Önce kendi ağınızı "
                       "izin verilen bloklara ekleyin.")
    db = get_db()
    for k, v in new.items():
        db.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                   (k, v))
    db.commit()
    get_settings(fresh=True)
    changed = [k for k in new if current.get(k) != new[k]]
    audit("AYAR_GUNCELLENDI", ", ".join(changed) or "değişiklik yok")
    return jsonify(ok=True, changed=changed)


@app.route("/api/admin/ldap-test", methods=["POST"])
@login_required("admin")
def api_ldap_test():
    data = body()
    st = get_settings(fresh=True)
    for key in ("ldap_server", "ldap_port", "ldap_base_dn", "ldap_bind_dn", "ldap_bind_pass"):
        if data.get(key):
            st[key] = str(data[key]).strip()
    if not st.get("ldap_server"):
        raise ApiError("LDAP sunucu adresi girilmemiş.")
    try:
        from ldap3 import Connection
        server = ldap_server_obj(st)
        conn = Connection(server, user=st.get("ldap_bind_dn") or None, password=st.get("ldap_bind_pass") or None,
                          receive_timeout=8)
        if not conn.bind():
            msg = conn.result.get("description", "bilinmeyen hata")
            audit("LDAP_TEST", f"Başarısız: {msg}")
            return jsonify(ok=False, message=f"Sunucuya ulaşıldı ancak bağlanma (bind) başarısız: {msg}")
        detail = "Bağlantı ve kimlik doğrulama başarılı."
        test_email = str(data.get("test_email") or "").strip()
        if st.get("ldap_base_dn"):
            from ldap3 import SUBTREE
            if test_email:
                esc = _ldap_escape(test_email)
                conn.search(st["ldap_base_dn"], f"(|(mail={esc})(userPrincipalName={esc}))",
                            search_scope=SUBTREE, attributes=["cn"], size_limit=1)
                detail += (f" '{test_email}' dizinde bulundu." if conn.entries
                           else f" '{test_email}' dizinde bulunamadı.")
            else:
                conn.search(st["ldap_base_dn"], "(objectClass=*)", search_scope=SUBTREE, size_limit=1)
                detail += " Temel DN okunabiliyor." if conn.entries else " Temel DN altında kayıt bulunamadı."
        conn.unbind()
        audit("LDAP_TEST", "Başarılı")
        return jsonify(ok=True, message=detail)
    except Exception as exc:
        audit("LDAP_TEST", f"Hata: {exc}")
        return jsonify(ok=False, message=f"LDAP sunucusuna bağlanılamadı: {exc}")


@app.route("/api/admin/smtp-test", methods=["POST"])
@login_required("admin")
def api_smtp_test():
    data = body()
    to = s(data, "to", max_len=200) or current_user()["email"]
    if not EMAIL_RE.match(to):
        raise ApiError("Geçerli bir alıcı e-posta adresi giriniz.")
    st = get_settings(fresh=True)
    if not st.get("smtp_host"):
        raise ApiError("SMTP sunucu adresi girilmemiş.")
    try:
        smtp_send(to, "LABNET Test E-postası",
                  f"Bu bir test e-postasıdır.\nGönderim zamanı: {now_str()}\nSMTP sunucusu: "
                  f"{st.get('smtp_host')}:{st.get('smtp_port')}", st=st, raise_errors=True)
    except Exception as exc:
        return jsonify(ok=False, message=f"E-posta gönderilemedi: {exc}")
    audit("SMTP_TEST", f"Test e-postası gönderildi: {to}")
    return jsonify(ok=True, message=f"Test e-postası {to} adresine gönderildi.")


@app.route("/api/admin/backup")
@login_required("admin")
def api_backup():
    fd, tmp = tempfile.mkstemp(prefix="labnet-yedek-", suffix=".db")
    os.close(fd)
    src = connect_db()
    dst = sqlite3.connect(tmp)
    try:
        src.backup(dst)  # calisan veritabanindan tutarli kopya
    finally:
        dst.close()
        src.close()

    @after_this_request
    def _cleanup(resp):
        resp.call_on_close(lambda: os.path.exists(tmp) and os.remove(tmp))
        return resp

    audit("YEDEK_INDIRILDI", "Veritabanı yedeği indirildi.")
    name = f"labnet-yedek-{datetime.now().strftime('%Y%m%d-%H%M')}.db"
    return send_file(tmp, as_attachment=True, download_name=name, mimetype="application/x-sqlite3")


@app.route("/api/admin/audit")
@login_required("admin")
def api_audit():
    rows = get_db().execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100").fetchall()
    return jsonify([row_dict(r) for r in rows])


# --------------------------------------------------------------------------

init_db()

if __name__ == "__main__":
    from waitress import serve
    host = os.environ.get("LABNET_HOST", "0.0.0.0")
    port = int(os.environ.get("LABNET_PORT", "8080"))
    if SECRET_KEY == DEFAULT_SECRET:
        print("UYARI: Varsayılan LABNET_SECRET kullanılıyor. Üretimde ortam değişkeniyle değiştirin.")
    print(f"LABNET çalışıyor: http://{host}:{port}")
    serve(app, host=host, port=port, threads=8)
