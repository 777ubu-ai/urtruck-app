import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  ActivityIndicator, Platform, Modal, Pressable, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../utils/AuthContext';
import { DS } from '../utils/theme';
import { setLanguage, getLanguage } from '../utils/i18n';
import { useI18n } from '../utils/useI18n';

const LOGO = require('../../assets/logo.jpg');
const LANGS = [
  { code: 'RU', label: 'Русский', flag: '🇷🇺' },
  { code: 'KZ', label: 'Қазақша', flag: '🇰🇿' },
  { code: 'UZ', label: 'Oʻzbekcha', flag: '🇺🇿' },
  { code: 'EN', label: 'English', flag: '🇬🇧' },
  { code: 'CN', label: '中文', flag: '🇨🇳' },
  { code: 'KG', label: 'Кыргызча', flag: '🇰🇬' },
];

export default function OnboardingScreen({ navigation }) {
  const { ensureGuest } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(null);
  const [langOpen, setLangOpen] = useState(false);
  const [, setLangTick] = useState(0);
  const currentLang = LANGS.find(l => l.code === getLanguage()) || LANGS[0];
  const pickLang = (c) => { setLanguage(c); setLangTick(n => n + 1); setLangOpen(false); };

  const logoA = useRef(new Animated.Value(0)).current;
  const ctaA = useRef(new Animated.Value(0)).current;
  const cardsA = useRef(new Animated.Value(0)).current;
  const trustA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = (v, d) => Animated.timing(v, { toValue: 1, duration: 400, delay: d, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    Animated.stagger(100, [a(logoA, 0), a(ctaA, 0), a(cardsA, 0), a(trustA, 0)]).start();
  }, []);
  const anim = (v) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] });

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ])).start();
  }, []);

  const enterAsGuest = async () => {
    setLoading('browse');
    try { await ensureGuest(); navigation.replace('Main', { role: 'client' }); }
    catch {} finally { setLoading(null); }
  };
  const pickRole = (role) => {
    setLoading(role);
    navigation.navigate('Auth', { role });
    setTimeout(() => setLoading(null), 600);
  };

  return (
    <View style={s.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.topBar}>
            <View style={{ width: 44 }} />
            <TouchableOpacity style={s.langPill} onPress={() => setLangOpen(true)}>
              <Text style={s.langText}>{currentLang.flag} {currentLang.code}</Text>
            </TouchableOpacity>
          </View>

          <Animated.View style={[s.logoBlock, anim(logoA)]}>
            <View style={s.heroWrap}>
              <Image source={require('../../assets/hero.jpg')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={s.heroOverlay} />
            </View>
            <Image source={LOGO} style={s.logoImg} />
            <Text style={s.logoTitle}>UrTruck</Text>
            <Text style={s.logoSub}>INTERNATIONAL LOGISTICS</Text>
          </Animated.View>

          <Animated.View style={anim(ctaA)}>
            <TouchableOpacity style={s.cta} onPress={enterAsGuest} disabled={loading !== null} activeOpacity={0.85}>
              {loading === 'browse' ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <View style={s.ctaIcon}><Text style={{ fontSize: 20 }}>🔍</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.ctaTitle}>{t('onboarding_browse_title')}</Text>
                    <Text style={s.ctaSub}>{t('onboarding_browse_sub')}</Text>
                  </View>
                  <Text style={s.ctaArrow}>→</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[s.cardsRow, anim(cardsA)]}>
            <TouchableOpacity style={s.cardDriver} onPress={() => pickRole('driver')} disabled={loading !== null} activeOpacity={0.85}>
              {loading === 'driver' ? <ActivityIndicator color="#22c55e" /> : (
                <>
                  <View style={[s.cardIconWrap, { backgroundColor: 'rgba(34,197,94,0.15)' }]}><Text style={{ fontSize: 24 }}>🚛</Text></View>
                  <Text style={s.cardTitle}>{t('onboarding_role_driver')}</Text>
                  <Text style={s.cardSub}>{t('onboarding_role_driver_sub')}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.cardClient} onPress={() => pickRole('client')} disabled={loading !== null} activeOpacity={0.85}>
              {loading === 'client' ? <ActivityIndicator color="#3b82f6" /> : (
                <>
                  <View style={[s.cardIconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}><Text style={{ fontSize: 24 }}>📦</Text></View>
                  <Text style={s.cardTitle}>{t('onboarding_role_client')}</Text>
                  <Text style={s.cardSub}>{t('onboarding_role_client_sub')}</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[s.trust, anim(trustA)]}>
            <View style={s.flags}>
              {['🇰🇿', '🇷🇺', '🇺🇿', '🇨🇳', '🇰🇬'].map((f, i) => (
                <View key={i} style={s.flagCircle}><Text style={{ fontSize: 16 }}>{f}</Text></View>
              ))}
            </View>
            <View style={s.trustRow}>
              <Animated.View style={[s.onlineDot, { opacity: pulse }]} />
              <Text style={s.trustText}><Text style={s.trustBold}>500+</Text> {t('onboarding_trust_count')}</Text>
            </View>
            <Text style={s.disclaimer}>{t('onboarding_legal')}</Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <Modal transparent visible={langOpen} animationType="fade" onRequestClose={() => setLangOpen(false)}>
        <Pressable style={s.langBackdrop} onPress={() => setLangOpen(false)}>
          <Pressable style={s.langSheet}>
            <View style={s.langHandle} />
            <Text style={s.langSheetTitle}>{t('language_label')}</Text>
            <ScrollView style={{ width: '100%' }}>
              {LANGS.map(l => (
                <TouchableOpacity key={l.code} style={[s.langRow, l.code === currentLang.code && s.langRowActive]} onPress={() => pickLang(l.code)}>
                  <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                  <Text style={s.langRowText}>{l.label}</Text>
                  {l.code === currentLang.code && <Text style={{ color: '#22c55e' }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0f1a' },
  scroll: { paddingHorizontal: 16, paddingBottom: 30 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginBottom: 12 },
  langPill: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  langText: { color: '#94a3b8', fontSize: 12, fontFamily: DS.font.body },
  heroWrap: { width: '100%', height: 160, borderRadius: 20, marginBottom: 20, overflow: 'hidden' },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  logoBlock: { alignItems: 'center', marginBottom: 28 },
  logoImg: { width: 56, height: 56, borderRadius: 14 },
  logoTitle: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1, marginTop: 12, fontFamily: DS.font.heading },
  logoSub: { fontSize: 11, letterSpacing: 3, color: '#64748b', marginTop: 6, textTransform: 'uppercase', fontFamily: DS.font.body },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#22c55e', borderRadius: 12, padding: 18, marginBottom: 16 },
  ctaIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { color: '#fff', fontSize: 15, fontWeight: '700', textTransform: 'uppercase', fontFamily: DS.font.heading },
  ctaSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2, fontFamily: DS.font.body },
  ctaArrow: { color: 'rgba(255,255,255,0.6)', fontSize: 20, fontWeight: '700' },
  cardsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  cardDriver: { flex: 1, borderRadius: 16, padding: 18, alignItems: 'center', minHeight: 130, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' },
  cardClient: { flex: 1, borderRadius: 16, padding: 18, alignItems: 'center', minHeight: 130, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  cardTitle: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center', fontFamily: DS.font.heading },
  cardSub: { color: '#64748b', fontSize: 11, marginTop: 3, textAlign: 'center', fontFamily: DS.font.body },
  trust: { alignItems: 'center' },
  flags: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  flagCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  trustText: { fontSize: 12, color: '#64748b', fontFamily: DS.font.body },
  trustBold: { fontWeight: '700', color: '#94a3b8' },
  disclaimer: { fontSize: 10, color: '#475569', textAlign: 'center', marginTop: 8, fontFamily: DS.font.body },
  langBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,15,26,0.85)' },
  langSheet: { backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '70%', alignItems: 'center' },
  langHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 14 },
  langSheetTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 14, fontFamily: DS.font.heading },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)', borderRadius: 12 },
  langRowActive: { backgroundColor: 'rgba(34,197,94,0.1)' },
  langRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#fff', fontFamily: DS.font.body },
});
