import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CountryPickerSheet from '../screens/onboarding/CountryPickerSheet';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { useV1Colors } from '../theme/designV1';
import { getCountryName } from '../utils/countries';
import { routeCountryCode as iso } from '../utils/routeCountryCode';
import { marketAPI } from '../utils/marketAPI';
import { regAPI } from '../utils/registration';
import { routeCountryCopy } from '../utils/routeCountryCopy';
import { publicationDraftKey, loadPublicationDraft, savePublicationDraft, clearPublicationDraft } from '../utils/publicationDraft';
import { KeyboardSafeScrollView } from './ui/v1/KeyboardSafeLayout';

const requestId = () => `route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

export default function RouteCountryClarification({ kind, entity, onChanged }) {
  const { t: baseT, lang } = useI18n();
  const t = key => routeCountryCopy(lang)[key] || baseT(key);
  const colors = useV1Colors();
  const { session } = useAuth();
  const uid = session?.user?.id;
  const id = entity?.id;
  const dealMode = kind === 'deal';
  const state = entity?.route_country_clarification || {};
  const pending = state.pending;
  const applied = state.applied;
  const from = iso(entity?.from_country || entity?.fromCountry);
  const to = iso(entity?.to_country || entity?.toCountry);
  const owner = dealMode ? (entity?.cargo_id ? entity?.shipper_id : entity?.driver_id)
    : kind === 'trip' ? entity?.driver_id || entity?.driverId : entity?.owner_id || entity?.ownerId;
  const participant = !dealMode || uid === entity?.shipper_id || uid === entity?.driver_id;
  const canEdit = Boolean(uid && uid === owner && (dealMode ? state.can_propose && entity?.route_country_valid === false : entity?.status === 'active'));
  const canConfirm = Boolean(dealMode && participant && state.can_confirm && pending);
  const shouldShow = Boolean(uid && id && participant && (dealMode
    ? entity?.route_country_valid === false || pending || applied
    : uid === owner && (!from || !to)));
  const key = publicationDraftKey(`route-country:${kind}:${id}`, uid);
  const current = React.useRef({ key, alive: true });
  current.current.key = key;
  React.useEffect(() => { current.current.alive = true; return () => { current.current.alive = false; }; }, []);
  const isCurrent = () => current.current.alive && current.current.key === key;
  const [open, setOpen] = React.useState(false);
  const [picker, setPicker] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [draftBusy, setDraftBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [attempt, setAttempt] = React.useState(0);
  const [listingApplied, setListingApplied] = React.useState(false);
  const generation = React.useRef(null);
  const pendingId = pending?.id;
  const pendingFrom = pending?.from_country_after;
  const pendingTo = pending?.to_country_after;

  React.useEffect(() => {
    setOpen(false); setPicker(null); setForm(null); setListingApplied(false);
    setBusy(false); setDraftBusy(false); setReady(false); setError(null); generation.current = null;
  }, [key]);

  React.useEffect(() => {
    if (!open || !key) return undefined;
    let cancelled = false;
    setReady(false); setError(null);
    const values = { from_country: iso(pendingFrom) || from, to_country: iso(pendingTo) || to,
      request_id: requestId(), proposal_id: pendingId || null };
    const load = async () => {
      try {
        if (canEdit && !canConfirm) {
          const saved = await loadPublicationDraft(key);
          if (cancelled || !isCurrent()) return;
          generation.current = saved.generation;
          const draft = saved.draft;
          setForm(draft ? { from_country: from || iso(draft.from_country), to_country: to || iso(draft.to_country),
            request_id: draft.request_id || requestId(), proposal_id: pendingId || null } : values);
        } else {
          setForm(values);
        }
        if (!cancelled && isCurrent()) setReady(true);
      } catch {
        if (!cancelled && isCurrent()) setError('route_retry');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, key, canEdit, canConfirm, pendingId, pendingFrom, pendingTo, from, to, attempt]);

  const close = () => { setPicker(null); setOpen(false); };
  const selected = async country => {
    const field = picker;
    setPicker(null);
    if (!field || !iso(country?.iso) || !form || busy || draftBusy) return;
    const next = { ...form, [field]: country.iso, request_id: requestId() };
    setForm(next); setDraftBusy(true); setError(null);
    try { await savePublicationDraft(key, next, generation.current); }
    catch { if (isCurrent()) setError('route_retry'); }
    finally { if (isCurrent()) setDraftBusy(false); }
  };

  const confirmMatches = Boolean(pendingId && form?.proposal_id === pendingId
    && form?.from_country === pendingFrom && form?.to_country === pendingTo);
  const save = async () => {
    if (!ready || busy || draftBusy || !form || !isCurrent()) return;
    if (canConfirm ? !confirmMatches : !canEdit || !iso(form.from_country) || !iso(form.to_country)) return;
    const values = { ...form };
    setBusy(true); setError(null);
    try {
      if (!canConfirm) await savePublicationDraft(key, values, generation.current);
      const token = await regAPI.getToken();
      if (!isCurrent()) return;
      const scope = { expectedToken: token, isCurrent };
      const result = canConfirm
        ? await marketAPI.confirmDealRouteCountry(id, values.proposal_id, scope)
        : await marketAPI.clarifyRouteCountry(kind, id, {
          from_country: values.from_country, to_country: values.to_country, request_id: values.request_id,
        }, scope);
      if (!isCurrent() || result.stale) return;
      if (!result.ok) {
        const changed = ['ROUTE_PROPOSAL_STALE', 'ROUTE_REQUEST_CONFLICT', 'ROUTE_ALREADY_RESOLVED', 'ROUTE_DEAL_CLOSED'];
        setError(changed.includes(result.code) ? 'route_changed' : result.status === 401 ? 'session_expired' : 'route_retry');
        if (changed.includes(result.code)) await onChanged?.();
        return;
      }
      if (!canConfirm) await clearPublicationDraft(key, values, null, generation.current);
      if (!isCurrent()) return;
      if (!dealMode) setListingApplied(true);
      close();
      await onChanged?.();
    } catch {
      if (isCurrent()) setError('route_retry');
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  if (!shouldShow || listingApplied) return null;
  const readOnly = !canEdit && !canConfirm;
  const closedPending = pending && !['accepted', 'in_progress', 'at_border'].includes(entity?.status);
  const help = applied ? 'route_applied' : closedPending ? 'route_changed' : canConfirm ? 'route_confirm_pending'
    : pending ? 'route_pending' : canEdit ? dealMode ? 'route_help_deal' : 'route_help_listing' : 'route_owner_needed';
  const label = country => country ? getCountryName(country, lang) : t('not_specified');

  return (
    <View style={[styles.entry, { borderColor: colors.border }]}>
      <TouchableOpacity onPress={() => setOpen(true)} testID={`route-country-open-${kind}`} accessibilityRole="button">
        <Text style={[styles.title, { color: colors.text }]}>{t('deal_clarify_route')}</Text>
      </TouchableOpacity>
      <Modal visible={open} onRequestClose={() => picker ? setPicker(null) : close()} animationType="slide">
        {picker ? <CountryPickerSheet
          navigation={{ goBack: () => setPicker(null) }}
          route={{ params: { onSelect: selected, showDialCode: false, fullCountryList: true } }}
        /> : <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
          <TouchableOpacity onPress={close} style={styles.close} testID="route-country-close" accessibilityRole="button">
            <Text style={{ color: colors.text }}>{t('cancel')}</Text>
          </TouchableOpacity>
          <KeyboardSafeScrollView contentContainerStyle={styles.form} testID="route-country-form">
            <Text style={[styles.heading, { color: colors.text }]}>{t('deal_clarify_route')}</Text>
            <Text style={[styles.help, { color: colors.textMuted }]}>{t(help)}</Text>
            {!ready && !error ? <ActivityIndicator color={colors.text} /> : null}
            {['from_country', 'to_country'].map((field, index) => {
              const fixed = Boolean(index ? to : from);
              const city = index ? entity?.to_city || entity?.to : entity?.from_city || entity?.from;
              return <View key={field} style={styles.field}>
                <Text style={[styles.label, { color: colors.textMuted }]}>{t(index ? 'toCountry' : 'fromCountry')}{city ? ` · ${city}` : ''}</Text>
                <TouchableOpacity
                  onPress={() => setPicker(field)} disabled={!ready || readOnly || canConfirm || fixed || busy || draftBusy}
                  style={[styles.country, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  testID={`route-country-${index ? 'to' : 'from'}`} accessibilityRole="button"
                >
                  <Text style={{ color: colors.text }}>{label(form?.[field])}</Text>
                </TouchableOpacity>
              </View>;
            })}
            {error ? <Text style={[styles.help, { color: colors.text }]} testID="route-country-error">{t(error)}</Text> : null}
            {!ready && error ? <TouchableOpacity onPress={() => setAttempt(x => x + 1)} testID="route-country-draft-retry">
              <Text style={{ color: colors.text }}>{t('chat_attach_retry')}</Text>
            </TouchableOpacity> : null}
            {!readOnly ? <TouchableOpacity
              onPress={save} disabled={!ready || busy || draftBusy || !form?.from_country || !form?.to_country || (canConfirm && !confirmMatches)}
              style={[styles.save, { backgroundColor: colors.surface, borderColor: colors.border }]}
              testID={canConfirm ? 'route-country-confirm' : 'route-country-save'} accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={colors.text} /> : <Text style={[styles.title, { color: colors.text }]}>{t(canConfirm ? 'confirm' : 'edit_cargo_save')}</Text>}
            </TouchableOpacity> : null}
          </KeyboardSafeScrollView>
        </SafeAreaView>}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 15, fontWeight: '700' },
  safe: { flex: 1 },
  close: { padding: 20, alignSelf: 'flex-start' },
  form: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  heading: { fontSize: 21, fontWeight: '800' },
  help: { fontSize: 14, lineHeight: 21 },
  field: { gap: 8 },
  label: { fontSize: 13 },
  country: { minHeight: 50, borderWidth: 1, borderRadius: 12, padding: 14, justifyContent: 'center' },
  save: { minHeight: 52, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
