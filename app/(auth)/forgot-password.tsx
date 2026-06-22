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

type Step = 'request' | 'confirm';
type ConfirmField = 'token' | 'newPassword' | 'confirmPassword';

// OTP-based password reset. Step 1 emails a numeric recovery code (length is
// the Supabase "Email OTP length" setting, 6–10 digits); step 2
// verifies it (which establishes a recovery session) and sets the new password.
// Once the session exists the (auth) layout redirects to /(app), so a
// successful reset lands the user signed in with their new password.
export default function ForgotPassword() {
  const theme = useTheme();
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
      setEmailError(parsed.error.issues[0]?.message ?? 'Enter a valid email');
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
      setFeedback('If an account exists for that email, a verification code is on its way.');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Could not send the code');
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
        setConfirmErrors({ token: 'That code is invalid or expired' });
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
      setFeedback(err?.message ?? 'Could not reset your password');
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
            Reset password
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {step === 'request'
              ? "Enter your email and we'll send you a verification code."
              : `Enter the code sent to ${email.trim()} and choose a new password.`}
          </Text>
        </View>

        {step === 'request' ? (
          <>
            <TextInput
              label="Email"
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
              {emailError}
            </HelperText>
            <Button
              mode="contained"
              onPress={sendCode}
              loading={submitting}
              disabled={submitting}
              style={styles.primary}
            >
              Send code
            </Button>
          </>
        ) : (
          <>
            <TextInput
              label="Verification code"
              mode="outlined"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={10}
              value={confirm.token}
              onChangeText={(t) => setConfirm((s) => ({ ...s, token: t.replace(/\D/g, '') }))}
              error={!!confirmErrors.token}
            />
            <HelperText type="error" visible={!!confirmErrors.token}>
              {confirmErrors.token}
            </HelperText>

            <TextInput
              label="New password"
              mode="outlined"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry={!showPw}
              value={confirm.next}
              onChangeText={(t) => setConfirm((s) => ({ ...s, next: t }))}
              error={!!confirmErrors.newPassword}
              right={
                <TextInput.Icon
                  icon={showPw ? 'eye-off' : 'eye'}
                  onPress={() => setShowPw((v) => !v)}
                />
              }
            />
            <HelperText type="error" visible={!!confirmErrors.newPassword}>
              {confirmErrors.newPassword}
            </HelperText>

            <TextInput
              label="Confirm new password"
              mode="outlined"
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry={!showPw}
              value={confirm.confirmPw}
              onChangeText={(t) => setConfirm((s) => ({ ...s, confirmPw: t }))}
              error={!!confirmErrors.confirmPassword}
            />
            <HelperText type="error" visible={!!confirmErrors.confirmPassword}>
              {confirmErrors.confirmPassword}
            </HelperText>

            <Button
              mode="contained"
              onPress={resetPassword}
              loading={submitting}
              disabled={submitting}
              style={styles.primary}
            >
              Reset password
            </Button>
            <Button mode="text" onPress={sendCode} disabled={submitting} style={styles.secondary}>
              Resend code
            </Button>
          </>
        )}

        <Button
          mode="text"
          onPress={() => router.replace('/(auth)/login')}
          style={styles.secondary}
        >
          Back to sign in
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
