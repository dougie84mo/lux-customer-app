import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  HelperText,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { resetConfirmSchema, resetRequestSchema } from '@/lib/schemas';
import { tMessage } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';

type Step = 'request' | 'confirm';
type ConfirmField = 'token' | 'newPassword' | 'confirmPassword';

// OTP-based password reset. Step 1 emails a numeric recovery code (length is
// the Supabase "Email OTP length" setting, 6–10 digits); step 2
// verifies it (which establishes a recovery session) and sets the new password.
// Once the session exists the (auth) layout redirects to /(app), so a
// successful reset lands the user signed in with their new password.
export default function ForgotPassword() {
  const theme = useTheme();
  const { t } = useTranslation(['auth', 'common']);
  const [step, setStep] = useState<Step>('request');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState({ token: '', next: '', confirmPw: '' });
  const [confirmErrors, setConfirmErrors] = useState<Partial<Record<ConfirmField, string>>>({});

  const sendCode = async () => {
    setEmailError(null);
    const parsed = resetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'auth:validation.email');
      return;
    }
    setSubmitting(true);
    try {
      // Supabase doesn't reveal whether the address exists, so this resolves
      // without error for unknown emails — we move to the code step regardless.
      // Lowercase so the request and the later verify key off the same value
      // GoTrue stores (emails are normalized to lowercase server-side).
      const { error } = await supabase.auth.resetPasswordForEmail(
        parsed.data.email.toLowerCase(),
      );
      if (error) throw error;
      setStep('confirm');
      setFeedback(t('forgot.codeSent'));
    } catch (err: any) {
      setFeedback(err?.message ?? t('forgot.sendFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    setConfirmErrors({});
    const parsed = resetConfirmSchema.safeParse({
      token: confirm.token,
      newPassword: confirm.next,
      confirmPassword: confirm.confirmPw,
    });
    if (!parsed.success) {
      const next: Partial<Record<ConfirmField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as ConfirmField;
        if (!next[key]) next[key] = issue.message;
      }
      setConfirmErrors(next);
      return;
    }
    setSubmitting(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: parsed.data.token,
        type: 'recovery',
      });
      if (verifyError) {
        // Stored as a key like the Zod messages; rendered with tMessage.
        setConfirmErrors({ token: 'auth:forgot.codeInvalid' });
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: parsed.data.newPassword,
      });
      if (updateError) throw updateError;
      // Session now exists → the (auth) layout redirects to /(app). Nudge it
      // explicitly too in case the redirect hasn't fired yet.
      router.replace('/(app)');
    } catch (err: any) {
      setFeedback(err?.message ?? t('forgot.resetFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text variant="headlineMedium" style={{ fontWeight: '700' }}>
            {t('forgot.title')}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {step === 'request'
              ? t('forgot.subtitleRequest')
              : t('forgot.subtitleConfirm', { email: email.trim() })}
          </Text>
        </View>

        {step === 'request' ? (
          <>
            <TextInput
              label={t('forgot.email')}
              mode="outlined"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              error={!!emailError}
            />
            <HelperText type="error" visible={!!emailError}>
              {tMessage(emailError)}
            </HelperText>
            <Button
              mode="contained"
              onPress={sendCode}
              loading={submitting}
              disabled={submitting}
              style={styles.primary}
            >
              {t('forgot.sendCode')}
            </Button>
          </>
        ) : (
          <>
            <TextInput
              label={t('forgot.code')}
              mode="outlined"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={10}
              value={confirm.token}
              onChangeText={(v) => setConfirm((s) => ({ ...s, token: v.replace(/\D/g, '') }))}
              error={!!confirmErrors.token}
            />
            <HelperText type="error" visible={!!confirmErrors.token}>
              {tMessage(confirmErrors.token)}
            </HelperText>

            <TextInput
              label={t('forgot.newPassword')}
              mode="outlined"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry={!showPw}
              value={confirm.next}
              onChangeText={(v) => setConfirm((s) => ({ ...s, next: v }))}
              error={!!confirmErrors.newPassword}
              right={
                <TextInput.Icon
                  icon={showPw ? 'eye-off' : 'eye'}
                  onPress={() => setShowPw((v) => !v)}
                />
              }
            />
            <HelperText type="error" visible={!!confirmErrors.newPassword}>
              {tMessage(confirmErrors.newPassword)}
            </HelperText>

            <TextInput
              label={t('forgot.confirmPassword')}
              mode="outlined"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry={!showPw}
              value={confirm.confirmPw}
              onChangeText={(v) => setConfirm((s) => ({ ...s, confirmPw: v }))}
              error={!!confirmErrors.confirmPassword}
            />
            <HelperText type="error" visible={!!confirmErrors.confirmPassword}>
              {tMessage(confirmErrors.confirmPassword)}
            </HelperText>

            <Button
              mode="contained"
              onPress={resetPassword}
              loading={submitting}
              disabled={submitting}
              style={styles.primary}
            >
              {t('forgot.resetPassword')}
            </Button>
            <Button mode="text" onPress={sendCode} disabled={submitting} style={styles.secondary}>
              {t('forgot.resendCode')}
            </Button>
          </>
        )}

        <Button
          mode="text"
          onPress={() => router.replace('/(auth)/login')}
          style={styles.secondary}
        >
          {t('forgot.backToSignIn')}
        </Button>
      </ScrollView>

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={5000}>
        {feedback ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
    paddingTop: 64,
    flexGrow: 1,
  },
  header: {
    marginBottom: 24,
  },
  primary: {
    marginTop: 8,
    paddingVertical: 4,
  },
  secondary: {
    marginTop: 12,
  },
});
