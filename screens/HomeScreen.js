import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    ActivityIndicator, StyleSheet, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';

const API = 'http://192.168.181.241:8001';

export default function HomeScreen() {
    const { theme } = useTheme();
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [settings, setSettings] = useState(null);
    const [apiStatus, setApiStatus] = useState('checking'); // 'online' | 'offline' | 'checking'

    // --- 1. ÇEVRİMDIŞI (OFFLINE) VERİ KAYDETME FONKSİYONU ---
    const saveToOfflineQueue = async (url, body) => {
        try {
            const existingData = await AsyncStorage.getItem('offlineQueue');
            let queue = existingData ? JSON.parse(existingData) : [];
            queue.push({ url, body, timestamp: new Date().toISOString() });
            await AsyncStorage.setItem('offlineQueue', JSON.stringify(queue));
            // Ekranda uyarı göstermek istersen bunu açabilirsin:
            // Alert.alert("Çevrimdışı Kayıt", "İstek yerel hafızaya alındı.");
        } catch (e) {
            console.log("Kayıt hatası:", e);
        }
    };

    // --- 2. İNTERNET GELİNCE SENKRONİZE ETME FONKSİYONU ---
    const syncOfflineData = async () => {
        try {
            const existingData = await AsyncStorage.getItem('offlineQueue');
            if (existingData) {
                let queue = JSON.parse(existingData);
                if (queue.length > 0) {
                    for (let item of queue) {
                        await fetch(item.url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(item.body)
                        });
                    }
                    await AsyncStorage.removeItem('offlineQueue');
                    Alert.alert("Senkronizasyon Başarılı", "Çevrimdışıyken alınan kararlar sisteme aktarıldı!");
                }
            }
        } catch (e) {
            console.log("Senk hatası:", e);
        }
    };

    // --- 3. İNTERNET DURUMUNU SÜREKLİ DİNLEYEN KANCA ---
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            if (state.isConnected) {
                syncOfflineData();
                checkApi(); // İnternet gelince API'yi de kontrol et
            }
        });
        return () => unsubscribe();
    }, []);


    // Sayfaya odaklanıldığında ayarları yükle
    useFocusEffect(
        useCallback(() => {
            loadSettings();
            checkApi();
        }, [])
    );

    async function checkApi() {
        setApiStatus('checking');
        try {
            const res = await fetch(`${API}/health`);
            const data = await res.json();
            setApiStatus(data.status === 'ok' ? 'online' : 'offline');
        } catch (e) {
            setApiStatus('offline');
        }
    }

    async function loadSettings() {
        try {
            const s = await AsyncStorage.getItem('tarla_settings');
            if (s) setSettings(JSON.parse(s));
        } catch (e) { }
    }

    // --- 4. ANA ANALİZ (YAPAY ZEKA VE OFFLINE KARAR) FONKSİYONU ---
    async function analizeEt() {
        // Test için ayarlar yoksa geçici sahte veri oluşturuyoruz (Çökmeyi engeller)
        let currentSettings = settings;
        if (!currentSettings) {
            currentSettings = { mod: 'sensorlu', lat: 24.3, lon: 69.15, wr: 5, rain: 0 };
        }

        const url = currentSettings.mod === 'sensorsuz'
            ? `${API}/predict/no-sensor`
            : `${API}/predict/sensor`;

        const body = currentSettings.mod === 'sensorsuz'
            ? { location: { lat: currentSettings.lat, lon: currentSettings.lon } }
            : { wr_current: currentSettings.wr, location: { lat: currentSettings.lat, lon: currentSettings.lon }, rain_next_3days: currentSettings.rain };

        setLoading(true);
        setResult(null);

        try {
            const netInfo = await NetInfo.fetch();

            if (netInfo.isConnected) {
                // İNTERNET VAR: API'den Yapay Zeka Sonucu Al
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json();
                setResult(data);
            } else {
                // İNTERNET YOK (Offline): Yerel Acil Durum Kararı Üret
                UretOfflineKarar(url, body, currentSettings);
            }
        } catch (error) {
            // İNTERNET VAR AMA SUNUCU KAPALI (Crash engelleme)
            console.log("Sunucuya ulaşılamıyor, offline karar mekanizması devrede.");
            UretOfflineKarar(url, body, currentSettings);
        }
        setLoading(false);
    }

    // OFFLINE DURUMDA ÇALIŞACAK YARDIMCI FONKSİYON
    function UretOfflineKarar(url, body, currentSettings) {
        // 1. Veriyi hafızaya kaydet
        saveToOfflineQueue(url, body);

        // 2. Basit Mantık (Threshold): Nem 40'tan küçükse sula!
        const isSoilDry = (currentSettings.wr || 0) < 40;

        const offlineResult = {
            irrigate_now: isSoilDry,
            amount_mm: isSoilDry ? 15 : 0,
            stress_detected: isSoilDry,
            message: "⚠️ ÇEVRİMDIŞI MOD: Yapay zekaya ulaşılamıyor. Sensör verilerine göre yerel acil durum kuralları (Threshold) işletildi.",
            wr_current: currentSettings.wr || '-',
            temp_max: null,
            rain_next_3days: currentSettings.rain || 0,
            stress_level: isSoilDry ? "Riskli (Çevrimdışı)" : "Normal (Çevrimdışı)",
            vpd: null,
            wr_forecast: null // Offline modda tahmin grafiği boş kalsın
        };

        // 3. Ekrana Bas
        setResult(offlineResult);
    }

    // --- UI YARDIMCI FONKSİYONLARI ---
    function getBanner() {
        if (!result) return null;
        if (result.irrigate_now) {
            return { bg: '#e8f4fd', border: '#2196F3', icon: '💧', title: t.irrigateNow || "Şimdi Sula", sub: `${result.amount_mm} ${t.mmAmount || "mm"}`, iconBg: '#2196F3' };
        } else if (result.stress_detected) {
            return { bg: '#fffbea', border: '#F59E0B', icon: '⚠️', title: t.stressRisk || "Risk Tespit Edildi", sub: result.days_until_stress ? `${result.days_until_stress} ${t.daysUntilStress}` : t.stressSoon || "Acil Müdahale", iconBg: '#F59E0B' };
        } else {
            return { bg: theme.greenLight, border: theme.green, icon: '✅', title: t.allGood || "Her Şey Yolunda", sub: t.allGoodSub || "Sulama gerekmiyor", iconBg: theme.green };
        }
    }

    const banner = getBanner();
    const s = makeStyles(theme);

    function ApiStatusBadge() {
        const color = apiStatus === 'online' ? '#4caf50' : apiStatus === 'offline' ? '#f44336' : '#FF9800';
        const label = apiStatus === 'online' ? (t.apiOnline || 'API Bağlı') : apiStatus === 'offline' ? (t.apiOffline || 'API Bağlı Değil') : (t.apiChecking || 'Kontrol ediliyor...');
        return (
            <TouchableOpacity onPress={checkApi} style={s.apiBadge}>
                <View style={[s.apiDot, { backgroundColor: color }]} />
                <Text style={[s.apiLabel, { color }]}>{label}</Text>
            </TouchableOpacity>
        );
    }

    // --- EKRAN TASARIMI (RENDER) ---
    return (
        <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

            {/* API Durum Göstergesi */}
            <ApiStatusBadge />

            {/* Üst Başlık */}
            <View style={s.headerCard}>
                <Text style={s.headerIcon}>🌾</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.headerTitle}>{t.fieldAnalysis || "Tarla Analizi"}</Text>
                    <Text style={s.headerSub}>
                        {settings
                            ? `📍 ${settings.cityName || `${settings.lat}, ${settings.lon}`}`
                            : `📍 ${t.noLocation || "Konum Yok"}`}
                    </Text>
                </View>
                <View style={[s.modBadge, { backgroundColor: settings?.mod === 'sensorlu' ? theme.green : '#6B7280' }]}>
                    <Text style={s.modBadgeText}>
                        {settings?.mod === 'sensorlu' ? (t.sensor || "Sensörlü") : (t.sensorless || "Sensörsüz")}
                    </Text>
                </View>
            </View>

            {/* Analiz Et Butonu */}
            <TouchableOpacity style={s.btn} onPress={analizeEt} disabled={loading}>
                {loading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Text style={s.btnIcon}>🔍</Text>
                        <Text style={s.btnText}>{t.analyze || "Analiz Et"}</Text>
                    </>
                }
            </TouchableOpacity>

            {loading && (
                <View style={s.loadingBox}>
                    <Text style={s.loadingText}>{t.analyzing || "Analiz ediliyor..."}</Text>
                </View>
            )}

            {/* Sonuç Banner */}
            {banner && (
                <View style={[s.banner, { backgroundColor: banner.bg, borderColor: banner.border }]}>
                    <View style={[s.bannerIconWrap, { backgroundColor: banner.iconBg }]}>
                        <Text style={{ fontSize: 28 }}>{banner.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[s.bannerTitle, { color: banner.border }]}>{banner.title}</Text>
                        <Text style={[s.bannerSub, { color: banner.border }]}>{banner.sub}</Text>
                    </View>
                </View>
            )}

            {/* Stat Kartları */}
            {result && (
                <>
                    <Text style={s.sectionLabel}>{t.detailedInfo || "Detaylı Bilgi"}</Text>
                    <View style={s.statGrid}>
                        <View style={s.statCard}>
                            <Text style={s.statIcon}>🌡️</Text>
                            <Text style={s.statValue}>{result.temp_max ? `${result.temp_max}°C` : '-'}</Text>
                            <Text style={s.statLabel}>{t.maxTemp || "Max Sıc."}</Text>
                        </View>
                        <View style={s.statCard}>
                            <Text style={s.statIcon}>💧</Text>
                            <Text style={s.statValue}>{result.wr_current ?? '-'}</Text>
                            <Text style={s.statLabel}>{t.soilMoisture || "Toprak Nemi"}</Text>
                        </View>
                        <View style={s.statCard}>
                            <Text style={s.statIcon}>🌧️</Text>
                            <Text style={s.statValue}>{result.rain_next_3days ?? '-'}</Text>
                            <Text style={s.statLabel}>{t.rain3Days || "3 G. Yağış"}</Text>
                        </View>
                        <View style={s.statCard}>
                            <Text style={s.statIcon}>💨</Text>
                            <Text style={s.statValue}>{result.vpd ?? '-'}</Text>
                            <Text style={s.statLabel}>{t.vpd || "VPD"}</Text>
                        </View>
                        <View style={s.statCard}>
                            <Text style={s.statIcon}>⚡</Text>
                            <Text style={s.statValue}>{result.stress_level || '-'}</Text>
                            <Text style={s.statLabel}>{t.stressLevel || "Stres Seviyesi"}</Text>
                        </View>
                        <View style={s.statCard}>
                            <Text style={s.statIcon}>🚿</Text>
                            <Text style={s.statValue}>{result.amount_mm ?? '-'}</Text>
                            <Text style={s.statLabel}>{t.irrigation || "Sulama"}</Text>
                        </View>
                    </View>

                    {/* Wr Forecast Kartları (Sadece Online'da Çıkar) */}
                    {result.wr_forecast && (
                        <>
                            <Text style={s.sectionLabel}>{t.wrForecast || "Tahmin"}</Text>
                            <View style={s.forecastRow}>
                                {[
                                    { label: `${t.day || "Gün"} 1`, value: result.wr_forecast.day_1 },
                                    { label: `${t.day || "Gün"} 3`, value: result.wr_forecast.day_3 },
                                    { label: `${t.day || "Gün"} 7`, value: result.wr_forecast.day_7 },
                                ].map((item, i) => {
                                    const isRisk = item.value < 109; // Kendi risk değerine göre değiştirebilirsin
                                    return (
                                        <View key={i} style={[s.forecastCard, { borderColor: isRisk ? '#F59E0B' : theme.green }]}>
                                            <Text style={s.forecastLabel}>{item.label}</Text>
                                            <Text style={[s.forecastValue, { color: isRisk ? '#F59E0B' : theme.green }]}>
                                                {item.value ? `${item.value} mm` : '-'}
                                            </Text>
                                            <Text style={[s.forecastStatus, { color: isRisk ? '#F59E0B' : theme.green }]}>
                                                {isRisk ? `⚠️ Risk` : `✅ ${t.normal || "Normal"}`}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {/* AI veya Çevrimdışı Mesajı */}
                    <View style={s.messageCard}>
                        <Text style={s.messageTitle}>🤖 {t.aiSuggestion || "Sistem Tavsiyesi"}</Text>
                        <Text style={s.messageText}>{result.message}</Text>
                    </View>
                </>
            )}

            {/* Boş durum */}
            {!result && !loading && (
                <View style={s.emptyBox}>
                    <Text style={s.emptyIcon}>🌱</Text>
                    <Text style={s.emptyTitle}>{t.waitingAnalysis || "Analiz Bekleniyor"}</Text>
                    <Text style={s.emptyText}>{t.waitingDesc || "Mevcut durumu görmek için yukarıdan analiz et butonuna tıklayın."}</Text>
                </View>
            )}

        </ScrollView>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.bg },
        apiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10, borderWidth: 0.5, borderColor: theme.border },
        apiDot: { width: 8, height: 8, borderRadius: 4 },
        apiLabel: { fontSize: 11, fontWeight: '500' },
        headerCard: { backgroundColor: theme.header, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
        headerIcon: { fontSize: 36 },
        headerTitle: { fontSize: 16, fontWeight: '500', color: '#fff' },
        headerSub: { fontSize: 12, color: '#a8d5b5', marginTop: 2 },
        modBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
        modBadgeText: { fontSize: 11, color: '#fff', fontWeight: '500' },
        btn: { backgroundColor: theme.green, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, elevation: 4 },
        btnIcon: { fontSize: 18 },
        btnText: { color: '#fff', fontWeight: '500', fontSize: 16 },
        loadingBox: { backgroundColor: theme.greenLight, borderRadius: 10, padding: 12, marginBottom: 12, alignItems: 'center' },
        loadingText: { fontSize: 13, color: theme.greenText },
        banner: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, borderWidth: 1.5 },
        bannerIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
        bannerTitle: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
        bannerSub: { fontSize: 13 },
        sectionLabel: { fontSize: 12, fontWeight: '500', color: theme.textSub, marginBottom: 10, marginTop: 4 },
        statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
        statCard: { flex: 1, minWidth: '30%', backgroundColor: theme.statCard, borderRadius: 14, padding: 12, alignItems: 'center', elevation: 2, borderWidth: 0.5, borderColor: theme.border },
        statIcon: { fontSize: 22, marginBottom: 6 },
        statValue: { fontSize: 15, fontWeight: '500', color: theme.green, marginBottom: 4 },
        statLabel: { fontSize: 10, color: theme.textLight, textAlign: 'center' },
        forecastRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
        forecastCard: { flex: 1, backgroundColor: theme.card, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1.5, elevation: 2 },
        forecastLabel: { fontSize: 12, color: theme.textSub, marginBottom: 6, fontWeight: '500' },
        forecastValue: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
        forecastStatus: { fontSize: 11 },
        messageCard: { backgroundColor: theme.card, borderRadius: 14, padding: 16, borderLeftWidth: 4, borderLeftColor: theme.green, elevation: 2 },
        messageTitle: { fontSize: 13, fontWeight: '500', color: theme.green, marginBottom: 8 },
        messageText: { fontSize: 13, color: theme.text, lineHeight: 20 },
        emptyBox: { alignItems: 'center', marginTop: 40, padding: 24, backgroundColor: theme.card, borderRadius: 16, elevation: 2, borderWidth: 0.5, borderColor: theme.border },
        emptyIcon: { fontSize: 48, marginBottom: 12 },
        emptyTitle: { fontSize: 16, fontWeight: '500', color: theme.text, marginBottom: 8 },
        emptyText: { fontSize: 13, color: theme.textSub, textAlign: 'center', lineHeight: 20 },
    });
}