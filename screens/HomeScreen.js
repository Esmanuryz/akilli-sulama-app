import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    ActivityIndicator, StyleSheet, Alert, Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';

const API = 'https://web-production-2b8d.up.railway.app';

export default function HomeScreen() {
    const { theme } = useTheme();
    const { t, lang } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [settings, setSettings] = useState(null);
    const [apiStatus, setApiStatus] = useState('checking');
    const [manualIrrigation, setManualIrrigation] = useState(false);
    const [irrigationLoading, setIrrigationLoading] = useState(false);

    // --- 1. ÇEVRİMDIŞI VERİ KUYRUĞU ---
    const saveToOfflineQueue = async (url, body) => {
        try {
            const existingData = await AsyncStorage.getItem('offlineQueue');
            let queue = existingData ? JSON.parse(existingData) : [];
            queue.push({ url, body, timestamp: new Date().toISOString() });
            await AsyncStorage.setItem('offlineQueue', JSON.stringify(queue));
        } catch (e) { console.log("Kayıt hatası:", e); }
    };

    // --- 2. SENKRONİZASYON ---
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
                    Alert.alert(t.saveSuccess, t.saveSuccessDesc);
                }
            }
        } catch (e) { console.log("Senk hatası:", e); }
    };

    // --- 3. DİNAMİK DURUM TAKİBİ ---
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            if (state.isConnected) {
                syncOfflineData();
                checkApi();
            }
        });
        return () => unsubscribe();
    }, []);

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
        } catch (e) { setApiStatus('offline'); }

        // Manuel sulama durumunu sunucudan çek
        try {
            const res = await fetch(`${API}/irrigation/control`);
            if (res.ok) {
                const data = await res.json();
                setManualIrrigation(data.manual_on);
            }
        } catch (_) { }
    }

    // --- 4. MANUEL SULAMA KONTROLÜ (DİLE DUYARLI) ---
    async function toggleManualIrrigation(value) {
        setIrrigationLoading(true);
        try {
            const res = await fetch(`${API}/irrigation/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manual_on: value }),
            });
            if (res.ok) {
                setManualIrrigation(value);
            } else {
                Alert.alert(t.errorTitle, lang === 'tr' ? 'Sulama komutu gönderilemedi.' : 'Could not send irrigation command.');
            }
        } catch (_) {
            Alert.alert(t.errorTitle, t.errorApi);
        }
        setIrrigationLoading(false);
    }

    async function loadSettings() {
        try {
            const s = await AsyncStorage.getItem('tarla_settings');
            if (s) setSettings(JSON.parse(s));
        } catch (e) { }
    }

    // --- 5. ANA ANALİZ ---
    async function analizeEt() {
        if (!settings) {
            Alert.alert(t.warningTitle, t.warningLocation);
            return;
        }

        setLoading(true);
        setResult(null);

        let wrValue = settings.wr;
        if (settings.mod === 'sensorlu') {
            try {
                const sdRes = await fetch(`${API}/sensor-data/latest`);
                if (sdRes.ok) {
                    const sdData = await sdRes.json();
                    wrValue = sdData.wr;
                    const updated = { ...settings, wr: wrValue };
                    await AsyncStorage.setItem('tarla_settings', JSON.stringify(updated));
                    setSettings(updated);
                }
            } catch (_) { }
        }

        const url = settings.mod === 'sensorsuz' ? `${API}/predict/no-sensor` : `${API}/predict/sensor`;
        const body = settings.mod === 'sensorsuz'
            ? { location: { lat: settings.lat, lon: settings.lon } }
            : { wr_current: wrValue, location: { lat: settings.lat, lon: settings.lon }, rain_next_3days: settings.rain };

        try {
            const netInfo = await NetInfo.fetch();
            if (netInfo.isConnected) {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json();
                setResult(data);
            } else {
                UretOfflineKarar(url, body, settings);
            }
        } catch (error) {
            UretOfflineKarar(url, body, settings);
        }
        setLoading(false);
    }

    function UretOfflineKarar(url, body, currentSettings) {
        saveToOfflineQueue(url, body);
        const isSoilDry = (currentSettings.wr || 0) < 40;
        const offlineResult = {
            irrigate_now: isSoilDry,
            amount_mm: isSoilDry ? 15 : 0,
            stress_detected: isSoilDry,
            message: lang === 'tr'
                ? "⚠️ ÇEVRİMDIŞI MOD: Yapay zekaya ulaşılamıyor. Yerel kurallar işletildi."
                : "⚠️ OFFLINE MODE: AI unreachable. Local rules applied.",
            wr_current: currentSettings.wr || '-',
            temp_max: null,
            rain_next_3days: currentSettings.rain || 0,
            stress_level: isSoilDry ? t.stressRiskLabel : t.normal,
            vpd: null,
            wr_forecast: null
        };
        setResult(offlineResult);
    }

    function getBanner() {
        if (!result) return null;
        if (result.irrigate_now) {
            return { bg: '#e8f4fd', border: '#2196F3', icon: '💧', title: t.irrigateNow, sub: `${result.amount_mm} ${t.mmAmount}`, iconBg: '#2196F3' };
        } else if (result.stress_detected) {
            return { bg: '#fffbea', border: '#F59E0B', icon: '⚠️', title: t.stressRisk, sub: result.days_until_stress ? `${result.days_until_stress} ${t.daysUntilStress}` : t.stressSoon, iconBg: '#F59E0B' };
        } else {
            return { bg: theme.greenLight, border: theme.green, icon: '✅', title: t.allGood, sub: t.allGoodSub, iconBg: theme.green };
        }
    }

    const banner = getBanner();
    const s = makeStyles(theme);

    return (
        <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

            {/* Offline Uyarı Banner */}
            {apiStatus === 'offline' && (
                <View style={s.offlineBanner}>
                    <Text style={s.offlineBannerText}>{t.offlineMode || '📵 Offline Mode'}</Text>
                </View>
            )}

            {/* API Durum Badge */}
            <TouchableOpacity onPress={checkApi} style={s.apiBadge}>
                <View style={[s.apiDot, { backgroundColor: apiStatus === 'online' ? '#4caf50' : apiStatus === 'offline' ? '#f44336' : '#FF9800' }]} />
                <Text style={[s.apiLabel, { color: apiStatus === 'online' ? '#4caf50' : apiStatus === 'offline' ? '#f44336' : '#FF9800' }]}>
                    {apiStatus === 'online' ? t.apiOnline : apiStatus === 'offline' ? t.apiOffline : t.apiChecking}
                </Text>
            </TouchableOpacity>

            {/* Header */}
            <View style={s.headerCard}>
                <Text style={s.headerIcon}>🌾</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.headerTitle}>{t.fieldAnalysis}</Text>
                    <Text style={s.headerSub}>
                        {settings ? `📍 ${settings.cityName || `${settings.lat}, ${settings.lon}`}` : `📍 ${t.noLocation}`}
                    </Text>
                </View>
                <View style={[s.modBadge, { backgroundColor: settings?.mod === 'sensorlu' ? theme.green : '#6B7280' }]}>
                    <Text style={s.modBadgeText}>{settings?.mod === 'sensorlu' ? t.sensor : t.sensorless}</Text>
                </View>
            </View>

            {/* Analiz Butonu */}
            <TouchableOpacity style={s.btn} onPress={analizeEt} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                    <>
                        <Text style={s.btnIcon}>🔍</Text>
                        <Text style={s.btnText}>{t.analyze}</Text>
                    </>
                )}
            </TouchableOpacity>

            {/* Manuel Sulama Switch */}
            <View style={s.manualCard}>
                <View style={{ flex: 1 }}>
                    <Text style={s.manualTitle}>💧 {t.manualIrrigation || 'Manuel Sulama'}</Text>
                    <Text style={s.manualSub}>{manualIrrigation ? (t.irrigationOn || 'Açık') : (t.irrigationOff || 'Kapalı')}</Text>
                </View>
                {irrigationLoading ? <ActivityIndicator size="small" color={theme.green} /> : (
                    <Switch
                        value={manualIrrigation}
                        onValueChange={toggleManualIrrigation}
                        trackColor={{ false: '#ccc', true: theme.green }}
                        thumbColor="#fff"
                    />
                )}
            </View>

            {loading && (
                <View style={s.loadingBox}><Text style={s.loadingText}>{t.analyzing}</Text></View>
            )}

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

            {result && (
                <>
                    <Text style={s.sectionLabel}>{t.detailedInfo}</Text>
                    <View style={s.statGrid}>
                        <StatItem icon="🌡️" value={result.temp_max ? `${result.temp_max}°C` : '-'} label={t.maxTemp} s={s} />
                        <StatItem icon="💧" value={result.wr_current ?? '-'} label={t.soilMoisture} s={s} />
                        <StatItem icon="🌧️" value={result.rain_next_3days ?? '-'} label={t.rain3Days} s={s} />
                        <StatItem icon="💨" value={result.vpd ?? '-'} label={t.vpd} s={s} />
                        <StatItem icon="⚡" value={result.stress_level || '-'} label={t.stressLevel} s={s} />
                        <StatItem icon="🚿" value={result.amount_mm ?? '-'} label={t.irrigation} s={s} />
                    </View>
                    <View style={s.messageCard}>
                        <Text style={s.messageTitle}>🤖 {t.aiSuggestion}</Text>
                        <Text style={s.messageText}>{result.message}</Text>
                    </View>
                </>
            )}

            {!result && !loading && (
                <View style={s.emptyBox}>
                    <Text style={s.emptyIcon}>🌱</Text>
                    <Text style={s.emptyTitle}>{t.waitingAnalysis}</Text>
                    <Text style={s.emptyText}>{t.waitingDesc}</Text>
                </View>
            )}
        </ScrollView>
    );
}

function StatItem({ icon, value, label, s }) {
    return (
        <View style={s.statCard}>
            <Text style={s.statIcon}>{icon}</Text>
            <Text style={s.statValue}>{value}</Text>
            <Text style={s.statLabel}>{label}</Text>
        </View>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.bg },
        offlineBanner: { backgroundColor: '#FF5722', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 10 },
        offlineBannerText: { color: '#fff', fontWeight: '500', fontSize: 13 },
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
        manualCard: { backgroundColor: theme.card, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1.5, borderColor: theme.green, elevation: 2 },
        manualTitle: { fontSize: 14, fontWeight: '500', color: theme.text, marginBottom: 2 },
        manualSub: { fontSize: 12, color: theme.textSub },
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
        messageCard: { backgroundColor: theme.card, borderRadius: 14, padding: 16, borderLeftWidth: 4, borderLeftColor: theme.green, elevation: 2 },
        messageTitle: { fontSize: 13, fontWeight: '500', color: theme.green, marginBottom: 8 },
        messageText: { fontSize: 13, color: theme.text, lineHeight: 20 },
        emptyBox: { alignItems: 'center', marginTop: 40, padding: 24, backgroundColor: theme.card, borderRadius: 16, elevation: 2, borderWidth: 0.5, borderColor: theme.border },
        emptyIcon: { fontSize: 48, marginBottom: 12 },
        emptyTitle: { fontSize: 16, fontWeight: '500', color: theme.text, marginBottom: 8 },
        emptyText: { fontSize: 13, color: theme.textSub, textAlign: 'center', lineHeight: 20 },
    });
}