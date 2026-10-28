// Staff screens (admin, moderation, witness team...) are reached from the Me
// screen only by staff, but a member can still open one from a link. Instead
// of the staff tools with an "Admins only" error under every section, they
// see one plain sentence and a way back.
import type { Role } from '@prayer-tower/shared';
import { router } from 'expo-router';
import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

import { Button, Screen } from './ui';

export function staffOnly<P extends object>(Inner: ComponentType<P>, allowed: Role[]) {
  function StaffOnly(props: P) {
    const { roles } = useAuth();
    const t = useT();
    if (roles.some((r) => allowed.includes(r))) return <Inner {...props} />;
    return (
      <Screen>
        <View style={styles.wrap}>
          {/* English only for now (Steve, 2026-10-28). */}
          <Text style={type.heading}>This page is for the Prayer Tower team.</Text>
          <Button variant="secondary" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
      </Screen>
    );
  }
  StaffOnly.displayName = `StaffOnly(${Inner.displayName ?? Inner.name})`;
  return StaffOnly;
}

const styles = StyleSheet.create({
  wrap: { padding: space.xl, gap: space.lg, alignItems: 'flex-start' },
});
