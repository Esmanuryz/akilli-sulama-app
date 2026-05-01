import { TouchableOpacity, Text, View, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

import HomeScreen from './screens/HomeScreen';
import ForecastScreen from './screens/ForecastScreen';
import SettingsScreen from './screens/SettingsScreen';
import AboutScreen from './screens/AboutScreen';

const Tab = createBottomTabNavigator();

function HeaderButtons() {
  const { isDark, toggleTheme } = useTheme();
  const { lang, toggleLang } = useLanguage();

  return (
    <View style={{ flexDirection: 'row', gap: 8, marginRight: 12, alignItems: 'center' }}>
      <TouchableOpacity
        onPress={toggleLang}
        style={{ flexDirection: 'row', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}
      >
        <Text style={{
          color: lang === 'tr' ? '#ffffff' : 'rgba(255,255,255,0.45)',
          fontSize: lang === 'tr' ? 14 : 11,
          fontWeight: lang === 'tr' ? '700' : '400',
        }}>TR</Text>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>|</Text>
        <Text style={{
          color: lang === 'en' ? '#ffffff' : 'rgba(255,255,255,0.45)',
          fontSize: lang === 'en' ? 14 : 11,
          fontWeight: lang === 'en' ? '700' : '400',
        }}>EN</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={toggleTheme}
        style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}
      >
        <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function TabIcon({ name }) {
  const icons = { Home: '🏠', Forecast: '📅', Settings: '⚙️', About: 'ℹ️' };
  return <Text style={{ fontSize: 20 }}>{icons[name]}</Text>;
}

function AppNavigator() {
  const { theme } = useTheme();
  const { t } = useLanguage(); // Dil çeviri objesini buradan alıyoruz

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          // İkonlar statik olduğu için burada kalabilir
          tabBarIcon: () => <TabIcon name={route.name} />,
          tabBarActiveTintColor: theme.green,
          tabBarInactiveTintColor: theme.textLight,
          tabBarStyle: {
            backgroundColor: theme.tabBar,
            borderTopColor: theme.tabBarBorder,
            height: 100,
            paddingBottom: 20,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
          headerStyle: { backgroundColor: theme.header, height: 90 },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '500' },
          // Header logosu her dilde aynı kalabilir
          headerTitle: () => (
            <Image
              source={require('./assets/logo_sulama-Photoroom.png')}
              style={{ width: 150, height: 130, resizeMode: 'contain' }}
            />
          ),
          headerRight: () => <HeaderButtons />,
        })}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: t.homeTab, // LanguageContext'ten gelen 'Ana Ekran' veya 'Home'
            headerShown: true
          }}
        />
        <Tab.Screen
          name="Forecast"
          component={ForecastScreen}
          options={{
            tabBarLabel: t.forecastTab, // 'Tahmin' veya 'Forecast'
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: t.settingsTab, // 'Ayarlar' veya 'Settings'
          }}
        />
        <Tab.Screen
          name="About"
          component={AboutScreen}
          options={{
            tabBarLabel: t.aboutTab, // 'Hakkında' veya 'About'
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppNavigator />
      </LanguageProvider>
    </ThemeProvider>
  );
}