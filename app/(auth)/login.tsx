import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Divider, HelperText, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle } from '@/lib/googleAuth';
import { AuthForm, authSchema } from '@/lib/schemas';

type Mode = 'signin' | 'signup';

export default function Login() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const onGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // On success, the auth listener swaps to the app; nothing else to do.
    } catch (err: any) {
      setFeedback(err?.message ?? 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const isSignup = mode === 'signup';
  const { control, handleSubmit, formState, reset, setError } = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '', name: '' },
  });

  const toggleMode = () => {
    setMode(isSignup ? 'signin' : 'signup');
    reset();
  };

  const onSubmit = async (values: AuthForm) => {
    if (isSignup && !values.name?.trim()) {
      setError('name', { message: 'Name is required' });
      return;
    }
    setSubmitting(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: { data: { name: values.name } },
        });
        if (error) throw error;
        setFeedback('Account created. Check your email if confirmation is required.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setFeedback(err?.message ?? 'Something went wrong');
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
            Smart Mirror Fleet
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {isSignup ? 'Create your account' : 'Sign in to manage your devices'}
          </Text>
        </View>

        {isSignup && (
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <View style={styles.field}>
                <TextInput
                  label="Name"
                  mode="outlined"
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={!!fieldState.error}
                />
                <HelperText type="error" visible={!!fieldState.error}>
                  {fieldState.error?.message}
                </HelperText>
              </View>
            )}
          />
        )}

        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <View style={styles.field}>
              <TextInput
                label="Email"
                mode="outlined"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={!!fieldState.error}
              />
              <HelperText type="error" visible={!!fieldState.error}>
                {fieldState.error?.message}
              </HelperText>
            </View>
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <View style={styles.field}>
              <TextInput
                label="Password"
                mode="outlined"
                autoCapitalize="none"
                autoComplete={isSignup ? 'password-new' : 'password'}
                textContentType={isSignup ? 'newPassword' : 'password'}
                secureTextEntry
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={!!fieldState.error}
              />
              <HelperText type="error" visible={!!fieldState.error}>
                {fieldState.error?.message}
              </HelperText>
            </View>
          )}
        />

        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={submitting || formState.isSubmitting}
          disabled={submitting || formState.isSubmitting}
          style={styles.primary}
        >
          {isSignup ? 'Create account' : 'Sign in'}
        </Button>

        <View style={styles.dividerRow}>
          <Divider style={styles.dividerLine} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginHorizontal: 12 }}>
            or
          </Text>
          <Divider style={styles.dividerLine} />
        </View>

        <Button
          mode="outlined"
          icon="google"
          onPress={onGoogle}
          loading={googleLoading}
          disabled={googleLoading || submitting}
        >
          Continue with Google
        </Button>

        {!isSignup && (
          <Button
            mode="text"
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.secondary}
          >
            Forgot password?
          </Button>
        )}

        <Button mode="text" onPress={toggleMode} style={styles.secondary}>
          {isSignup ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </Button>
      </ScrollView>

      <Snackbar visible={!!feedback} onDismiss={() => setFeedback(null)} duration={4000}>
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
  field: {
    marginBottom: 4,
  },
  primary: {
    marginTop: 8,
    paddingVertical: 4,
  },
  secondary: {
    marginTop: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
  },
});
