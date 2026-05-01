import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    ActivityIndicator, StyleSheet, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';

const API = 'https://daredevil-ditto-headway.ngrok-free.dev';

export default function ForecastScreen() {
    const { theme } = useTheme();
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [forecast, setForecast] = useState(null);
    const [settings, setSettings] = useState(null);
    const [threshold, setThreshold] = useState(109.2);

    useFocusEffect(
        useCallback(() => {
            loadSettings();
        }, [])
    );

    async function loadSettings() {
        try {
            const s = await AsyncStorage.getItem('tarla_settings');
            if (s) {
                const parsed = JSON.parse(s);
                setSettings(parsed);
                fetchForecast(parsed.lat, parsed.lon);
            }
        } catch (e) { }
    }

    async function fetchForecast(lat, lon) {
        setLoading(true);
        setForecast(null);
        try {
            const res = await fetch(`${API}/forecast/${lat}/${lon}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            setForecast(data);
            if (data.threshold) setThreshold(data.threshold);
        } catch (e) {
            // Hata mesajını t üzerinden veriyoruz
            Alert.alert(t.errorTitle, t.errorApi);
        }
        setLoading(false);
    }

    function getBarColor(wr) {
        if (wr >= threshold) return '#4caf50';
        if (wr >= threshold * 0.7) return '#FFA726';
        return '#f44336';
    }

    function getStatusLabel(wr) {
        if (wr >= threshold) return { label: t.normal, color: '#4caf50' };
        if (wr >= threshold * 0.7) return { label: t.stressRiskLabel, color: '#FFA726' };
        return { label: t.heavyStress || t.critical || 'Kritik', color: '#f44336' };
    }

    const s = makeStyles(theme);
    const days = (forecast?.forecasts ?? forecast?.days ?? []).map(d => ({
        day: d.day,
        wr: d.wr_predicted ?? d.wr ?? 0,
        stress_risk: d.stress_risk,
    }));
    const maxWr = Math.max(...days.map(d => d.wr ?? 0), threshold, 1);

    return (
        <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

            {/* Başlık Kartı */}
            <View style={s.headerCard}>
                <Text style={{ fontSize: 32 }}>📅</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.headerTitle}>{t.forecastTitle}</Text>
                    <Text style={s.headerSub}>
                        {settings
                            ? `📍 ${settings.cityName || `${settings.lat}, ${settings.lon}`}`
                            : `📍 ${t.noLocation}`}
                    </Text>
                </View>
            </View>

            {/* Sulama Eşiği Bilgisi - BURASI DÜZELTİLDİ */}
            <View style={s.thresholdCard}>
                <View>
                    <Text style={s.thresholdLabel}>{t.irrigationThreshold}</Text>
                    <Text style={s.thresholdDesc}>{t.viewDays}</Text>
                </View>
                <View style={s.thresholdBadge}>
                    <Text style={s.thresholdBadgeLabel}>{t.threshold}</Text>
                    <Text style={s.thresholdBadgeValue}>{threshold} mm</Text>
                </View>
            </View>

            {/* Yenile Butonu */}
            <TouchableOpacity
                style={s.btn}
                onPress={() => settings && fetchForecast(settings.lat, settings.lon)}
                disabled={loading}
            >
                {loading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Text style={{ fontSize: 18 }}>🔄</Text>
                        <Text style={s.btnText}>{t.refresh}</Text>
                    </>
                }
            </TouchableOpacity>

            {/* Grafik Alanı */}
            {days.length > 0 && (
                <>
                    <Text style={s.sectionLabel}>{t.wrForecast}</Text>
                    <View style={s.chartCard}>
                        <View style={s.chartArea}>
                            {days.map((day, i) => {
                                const wr = day.wr ?? 0;
                                const heightPercent = (wr / maxWr) * 100;
                                const thresholdPercent = (threshold / maxWr) * 100;
                                const barColor = getBarColor(wr);
                                const status = getStatusLabel(wr);

                                return (
                                    <View key={i} style={s.barColumn}>
                                        <Text style={[s.barValue, { color: barColor }]}>{wr.toFixed(1)} mm</Text>
                                        <View style={s.barContainer}>
                                            <View style={[s.thresholdLine, { bottom: `${thresholdPercent}%` }]} />
                                            <View style={s.barTrack}>
                                                <View style={[s.bar, {
                                                    height: `${heightPercent}%`,
                                                    backgroundColor: barColor,
                                                }]} />
                                            </View>
                                        </View>
                                        <Text style={s.barLabel}>{t.day} {day.day}</Text>
                                        <Text style={[s.barStatus, { color: status.color }]}>{status.label}</Text>
                                    </View>
                                );
                            })}
                        </View>

                        {/* Legend Bilgileri */}
                        <View style={s.legendRow}>
                            <View style={s.legendItem}>
                                <View style={[s.legendDot, { backgroundColor: '#4caf50' }]} />
                                <Text style={s.legendText}>{t.normal}</Text>
                            </View>
                            <View style={s.legendItem}>
                                <View style={[s.legendDot, { backgroundColor: '#FFA726' }]} />
                                <Text style={s.legendText}>{t.stressRiskLabel}</Text>
                            </View>
                            <View style={s.legendItem}>
                                <View style={[s.legendDash]} />
                                <Text style={s.legendText}>{t.threshold}</Text>
                            </View>
                        </View>
                    </View>
                </>
            )}

            {/* Veri Yoksa */}
            {!loading && days.length === 0 && (
                <View style={s.emptyBox}>
                    <Text style={{ fontSize: 48, marginBottom: 12 }}>🌤️</Text>
                    <Text style={s.emptyTitle}>{t.noForecast}</Text>
                    <Text style={s.emptyText}>{t.noForecastDesc}</Text>
                </View>
            )}

        </ScrollView>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.bg },
        headerCard: { backgroundColor: theme.header, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
        headerTitle: { fontSize: 16, fontWeight: '500', color: '#fff' },
        headerSub: { fontSize: 12, color: '#a8d5b5', marginTop: 2 },
        thresholdCard: { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: theme.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        thresholdLabel: { fontSize: 13, fontWeight: '500', color: theme.text },
        thresholdDesc: { fontSize: 11, color: theme.textSub, marginTop: 2 },
        thresholdBadge: { backgroundColor: theme.bg, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
        thresholdBadgeLabel: { fontSize: 10, color: theme.textSub },
        thresholdBadgeValue: { fontSize: 16, fontWeight: '500', color: theme.text, marginTop: 2 },
        btn: { backgroundColor: theme.green, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
        btnText: { color: '#fff', fontWeight: '500', fontSize: 16 },
        sectionLabel: { fontSize: 12, fontWeight: '500', color: theme.textSub, marginBottom: 10 },
        chartCard: { backgroundColor: theme.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: theme.border },
        chartArea: { flexDirection: 'row', gap: 12, marginBottom: 16, height: 200 },
        barColumn: { flex: 1, alignItems: 'center' },
        barValue: { fontSize: 10, fontWeight: '500', marginBottom: 4 },
        barContainer: { flex: 1, width: '100%', position: 'relative', justifyContent: 'flex-end' },
        thresholdLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#FFA726', borderStyle: 'dashed', zIndex: 1 },
        barTrack: { width: '70%', alignSelf: 'center', height: '100%', backgroundColor: theme.bg, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
        bar: { width: '100%' },
        barLabel: { fontSize: 11, color: theme.text, marginTop: 6 },
        barStatus: { fontSize: 9, marginTop: 2 },
        legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
        legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        legendDot: { width: 10, height: 10, borderRadius: 2 },
        legendDash: { width: 14, height: 2, backgroundColor: '#FFA726' },
        legendText: { fontSize: 11, color: theme.textSub },
        emptyBox: { alignItems: 'center', marginTop: 40, padding: 24, backgroundColor: theme.card, borderRadius: 16 },
        emptyTitle: { fontSize: 16, fontWeight: '500', color: theme.text, marginBottom: 8 },
        emptyText: { fontSize: 13, color: theme.textSub, textAlign: 'center' },
    });
}