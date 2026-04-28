import { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    TextInput, StyleSheet, Alert, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import MapView, { Marker } from 'react-native-maps';


export default function SettingsScreen() {
    const { theme } = useTheme();
    const { t, lang } = useLanguage();
    const [lat, setLat] = useState('39.9167');
    const [lon, setLon] = useState('32.8333');
    const [mod, setMod] = useState('sensorsuz');
    const [wr, setWr] = useState('95.0');
    const [rain, setRain] = useState('5.0');
    const [saved, setSaved] = useState(false);
    const [locationName, setLocationName] = useState('');
    const [locationLoading, setLocationLoading] = useState(false);
    const [showMap, setShowMap] = useState(false);
    const [tempCoords, setTempCoords] = useState(null);

    useEffect(() => { loadSettings(); }, []);

    useEffect(() => {
        const latNum = Number(lat);
        const lonNum = Number(lon);
        if (isNaN(latNum) || isNaN(lonNum) || !lat || !lon) { setLocationName(''); return; }
        const controller = new AbortController();
        setLocationLoading(true);
        fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latNum}&longitude=${lonNum}&localityLanguage=${lang}`,
            { signal: controller.signal }
        )
            .then(r => r.json())
            .then(data => {
                const parts = [data.city || data.locality, data.principalSubdivision, data.countryName].filter(Boolean);
                setLocationName(parts.join(', '));
            })
            .catch(() => setLocationName(''))
            .finally(() => { if (!controller.signal.aborted) setLocationLoading(false); });
        return () => controller.abort();
    }, [lat, lon, lang]);

    async function getGpsLocation() {
        try {
            const Location = await import('expo-location');
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(t.errorTitle, lang === 'tr' ? 'Konum izni verilmedi!' : 'Location permission denied!');
                return;
            }
            const location = await Location.getCurrentPositionAsync({});
            setLat(location.coords.latitude.toFixed(4));
            setLon(location.coords.longitude.toFixed(4));
        } catch (e) {
            Alert.alert(t.errorTitle, lang === 'tr' ? 'Konum alınamadı!' : 'Could not get location!');
        }
    }

    async function loadSettings() {
        try {
            const s = await AsyncStorage.getItem('tarla_settings');
            if (s) {
                const parsed = JSON.parse(s);
                setLat(String(parsed.lat));
                setLon(String(parsed.lon));
                setMod(parsed.mod);
                setWr(String(parsed.wr ?? '95.0'));
                setRain(String(parsed.rain ?? '5.0'));
            }
        } catch (e) { }
    }

    async function kaydet() {
        if (!lat || !lon) { Alert.alert(t.warningTitle, t.warningLocation); return; }
        const settings = {
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            mod,
            wr: parseFloat(wr),
            rain: parseFloat(rain),
            cityName: locationName,
        };
        try {
            await AsyncStorage.setItem('tarla_settings', JSON.stringify(settings));
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            Alert.alert(t.saveSuccess, t.saveSuccessDesc);
        } catch (e) { Alert.alert(t.errorTitle, t.saveError); }
    }
    function confirmMapLocation() {
        if (tempCoords) {
            setLat(tempCoords.lat.toFixed(4));
            setLon(tempCoords.lon.toFixed(4));
        }
        setShowMap(false);
    }

    const s = makeStyles(theme);

    return (
        <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

            {/* Koordinat Girişi */}
            <Text style={s.sectionLabel}>{t.manualCoords}</Text>
            <View style={s.card}>
                <Text style={s.inputLabel}>{t.lat}</Text>
                <TextInput
                    style={s.input}
                    value={lat}
                    onChangeText={setLat}
                    keyboardType="numeric"
                    placeholder={t.latPlaceholder}
                    placeholderTextColor={theme.textLight}
                />
                <View style={s.divider} />
                <Text style={s.inputLabel}>{t.lon}</Text>
                <TextInput
                    style={s.input}
                    value={lon}
                    onChangeText={setLon}
                    keyboardType="numeric"
                    placeholder={t.lonPlaceholder}
                    placeholderTextColor={theme.textLight}
                />

                {/* Konum Göstergesi */}
                {locationLoading && (
                    <View style={s.locationBox}>
                        <Text style={s.locationIcon}>🔍</Text>
                        <Text style={s.locationLoading}>
                            {lang === 'tr' ? 'Konum adı çözümleniyor...' : 'Resolving location name...'}
                        </Text>
                    </View>
                )}
                {!locationLoading && locationName !== '' && (
                    <View style={s.locationBox}>
                        <Text style={s.locationIcon}>📍</Text>
                        <View>
                            <Text style={s.locationName}>{locationName}</Text>
                            <Text style={s.locationSub}>{lat}, {lon}</Text>
                        </View>
                    </View>
                )}
                {!locationLoading && locationName === '' && lat && lon && (
                    <View style={[s.locationBox, { backgroundColor: '#fff3e0' }]}>
                        <Text style={s.locationIcon}>⚠️</Text>
                        <Text style={[s.locationLoading, { color: '#e65100' }]}>
                            {lang === 'tr' ? 'Konum bulunamadı' : 'Location not found'}
                        </Text>
                    </View>
                )}
            </View>

            {/* GPS Butonu */}
            <TouchableOpacity style={s.gpsBtn} onPress={getGpsLocation}>
                <Text style={{ fontSize: 18 }}>📡</Text>
                <Text style={s.gpsBtnText}>
                    {lang === 'tr' ? 'GPS ile Konumumu Al' : 'Get My GPS Location'}
                </Text>
            </TouchableOpacity>

            {/* Hızlı Şehir Seçimi */}
            <Text style={s.sectionLabel}>
                {lang === 'tr' ? '📍 Hızlı Şehir Seçimi' : '📍 Quick City Select'}
            </Text>
            <View style={s.cityGrid}>
                {[
                    { name: 'Ankara', lat: 39.9167, lon: 32.8333 },
                    { name: 'İstanbul', lat: 41.0082, lon: 28.9784 },
                    { name: 'İzmir', lat: 38.4237, lon: 27.1428 },
                    { name: 'Konya', lat: 37.8714, lon: 32.4846 },
                    { name: 'Adana', lat: 37.0, lon: 35.3213 },
                    { name: 'Bursa', lat: 40.1826, lon: 29.0665 },
                    { name: 'Antalya', lat: 36.8969, lon: 30.7133 },
                    { name: 'Samsun', lat: 41.2867, lon: 36.33 },
                    { name: 'Gaziantep', lat: 37.0662, lon: 37.3833 },
                    { name: 'Kayseri', lat: 38.7312, lon: 35.4787 },
                ].map((city, i) => {
                    const isSelected = parseFloat(lat) === city.lat && parseFloat(lon) === city.lon;
                    return (
                        <TouchableOpacity
                            key={i}
                            style={[s.cityChip, isSelected && { backgroundColor: theme.green, borderColor: theme.green }]}
                            onPress={() => { setLat(String(city.lat)); setLon(String(city.lon)); }}
                        >
                            <Text style={[s.cityChipText, isSelected && { color: '#fff' }]}>
                                {city.name}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            {/* Haritadan Seç Butonu */}
            <TouchableOpacity style={s.mapBtn} onPress={() => { setTempCoords(null); setShowMap(true); }}>
                <Text style={{ fontSize: 18 }}>🗺️</Text>
                <Text style={s.mapBtnText}>
                    {lang === 'tr' ? 'Haritadan Konum Seç' : 'Select Location on Map'}
                </Text>
            </TouchableOpacity>

            {/* Harita Modal */}
            <Modal visible={showMap} animationType="slide" onRequestClose={() => setShowMap(false)}>
                <View style={{ flex: 1 }}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>
                            {lang === 'tr' ? '🗺️ Haritaya tıkla, konum seç' : '🗺️ Tap on map to select location'}
                        </Text>
                        <TouchableOpacity onPress={() => setShowMap(false)}>
                            <Text style={s.modalClose}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {tempCoords && (
                        <View style={s.tempCoordsBar}>
                            <Text style={s.tempCoordsText}>
                                📍 {tempCoords.lat.toFixed(4)}, {tempCoords.lon.toFixed(4)}
                            </Text>
                        </View>
                    )}

                    <MapView
                        style={{ flex: 1 }}
                        initialRegion={{
                            latitude: parseFloat(lat) || 39.9167,
                            longitude: parseFloat(lon) || 32.8333,
                            latitudeDelta: 5,
                            longitudeDelta: 5,
                        }}
                        onPress={(e) => {
                            setTempCoords({
                                lat: e.nativeEvent.coordinate.latitude,
                                lon: e.nativeEvent.coordinate.longitude,
                            });
                        }}
                    >
                        {tempCoords && (
                            <Marker coordinate={{ latitude: tempCoords.lat, longitude: tempCoords.lon }} />
                        )}
                    </MapView>

                    <View style={s.modalButtons}>
                        <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowMap(false)}>
                            <Text style={s.modalCancelText}>{lang === 'tr' ? 'İptal' : 'Cancel'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.modalConfirmBtn, !tempCoords && { opacity: 0.5 }]}
                            onPress={confirmMapLocation}
                            disabled={!tempCoords}
                        >
                            <Text style={s.modalConfirmText}>
                                {lang === 'tr' ? 'Bu Konumu Kullan' : 'Use This Location'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            {/* Mod Seçimi */}
            <Text style={s.sectionLabel}>{t.modeSelect}</Text>
            <View style={s.card}>
                <View style={s.modRow}>
                    <TouchableOpacity
                        style={[s.modBtn, mod === 'sensorsuz' && { backgroundColor: theme.green, borderColor: theme.green }]}
                        onPress={() => setMod('sensorsuz')}
                    >
                        <Text style={[s.modBtnText, mod === 'sensorsuz' && { color: '#fff' }]}>{t.sensorless}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.modBtn, mod === 'sensorlu' && { backgroundColor: theme.green, borderColor: theme.green }]}
                        onPress={() => setMod('sensorlu')}
                    >
                        <Text style={[s.modBtnText, mod === 'sensorlu' && { color: '#fff' }]}>{t.sensor}</Text>
                    </TouchableOpacity>
                </View>
                <Text style={s.modDesc}>{mod === 'sensorsuz' ? t.sensorlessDesc : t.sensorDesc}</Text>
            </View>

            {/* Sensörlü Mod */}
            {mod === 'sensorlu' && (
                <>
                    <Text style={s.sectionLabel}>{t.sensorData}</Text>
                    <View style={s.card}>
                        <Text style={s.inputLabel}>{t.wrInput}</Text>
                        <TextInput
                            style={s.input}
                            value={wr}
                            onChangeText={setWr}
                            keyboardType="numeric"
                            placeholder={t.wrPlaceholder}
                            placeholderTextColor={theme.textLight}
                        />
                        <View style={s.divider} />
                        <Text style={s.inputLabel}>{t.rainInput}</Text>
                        <TextInput
                            style={s.input}
                            value={rain}
                            onChangeText={setRain}
                            keyboardType="numeric"
                            placeholder={t.rainPlaceholder}
                            placeholderTextColor={theme.textLight}
                        />
                    </View>
                </>
            )}

            {/* Kaydet */}
            <TouchableOpacity style={s.btn} onPress={kaydet}>
                <Text style={s.btnText}>{saved ? t.saved : t.save}</Text>
            </TouchableOpacity>

            <View style={s.infoBox}>
                <Text style={s.infoText}>💡 {t.offlineNote}</Text>
            </View>

        </ScrollView>
    );
}

function makeStyles(theme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.bg },
        sectionLabel: { fontSize: 12, fontWeight: '500', color: theme.textSub, marginBottom: 8, marginTop: 4 },
        card: { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: theme.border, elevation: 2 },
        inputLabel: { fontSize: 11, color: theme.textLight, marginBottom: 6 },
        input: { fontSize: 14, color: theme.text, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: theme.inputBg, borderRadius: 8 },
        divider: { height: 0.5, backgroundColor: theme.border, marginVertical: 10 },
        locationBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: theme.greenLight, borderRadius: 10, padding: 10 },
        locationIcon: { fontSize: 18 },
        locationName: { fontSize: 13, fontWeight: '500', color: theme.greenText },
        locationSub: { fontSize: 11, color: theme.textSub, marginTop: 2 },
        locationLoading: { fontSize: 12, color: theme.greenText, fontStyle: 'italic' },
        gpsBtn: { backgroundColor: theme.card, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, borderWidth: 1.5, borderColor: '#2196F3' },
        gpsBtnText: { fontSize: 14, fontWeight: '500', color: '#2196F3' },
        cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
        cityChip: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: theme.border },
        cityChipText: { fontSize: 13, color: theme.text },
        modRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
        modBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: theme.border, padding: 10, alignItems: 'center' },
        modBtnText: { fontSize: 13, color: theme.textSub, fontWeight: '500' },
        modDesc: { fontSize: 12, color: theme.textSub, lineHeight: 18 },
        btn: { backgroundColor: theme.green, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12, elevation: 4 },
        btnText: { color: '#fff', fontWeight: '500', fontSize: 16 },
        infoBox: { backgroundColor: theme.greenLight, borderRadius: 12, padding: 14 },
        infoText: { fontSize: 12, color: theme.greenText, lineHeight: 18 },
        mapBtn: { backgroundColor: theme.card, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, borderWidth: 1.5, borderColor: '#4caf50' },
        mapBtnText: { fontSize: 14, fontWeight: '500', color: '#4caf50' },
        modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1a5c35' },
        modalTitle: { fontSize: 14, fontWeight: '500', color: '#fff', flex: 1 },
        modalClose: { fontSize: 22, color: '#fff', paddingHorizontal: 8 },
        tempCoordsBar: { backgroundColor: '#e8f5e9', padding: 10, alignItems: 'center' },
        tempCoordsText: { fontSize: 13, fontWeight: '500', color: '#1a5c35' },
        modalButtons: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 0.5, borderColor: '#ddd', backgroundColor: '#fff' },
        modalCancelBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
        modalCancelText: { fontSize: 14, color: '#666' },
        modalConfirmBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: '#1a5c35' },
        modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '500' },
    });
}