import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  confirmPhoneOtp,
  forgotPassword,
  sendPhoneOtp,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../lib/auth';
import { LocalizedText, LocalizedTextInput } from '../lib/i18n';

const { height } = Dimensions.get('window');
const isValidPassword = (value: string) => value.length >= 6 && value.length <= 128;

interface LoginBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onLogin: () => void;
}

export default function LoginBottomSheet({ visible, onClose, onLogin }: LoginBottomSheetProps) {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'email' | 'phone' | 'otp'>('email');
  const [emailOrUser, setEmailOrUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [countryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<any[]>([]);
  const confirmationRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const clearError = () => setError('');

  useEffect(() => {
    if (visible) {
      setError('');
      setLoading(false);
      setResetMode(false);
      setResetMessage('');
    } else {
      confirmationRef.current = null;
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 12,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: height,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleEmailLogin = async () => {
    if (!emailOrUser.trim()) {
      setError('Please enter your email or username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    if (!isValidPassword(password)) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    const res: any = await signInWithEmail(emailOrUser.trim(), password);
    setLoading(false);
    if (res.success) onLogin();
    else setError(res.error || 'Login failed.');
  };

  const handleEmailSignUp = async () => {
    if (!emailOrUser.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please create a password.');
      return;
    }
    if (!isValidPassword(password)) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    const res: any = await signUpWithEmail(emailOrUser.trim(), password);
    setLoading(false);
    if (res.success) onLogin();
    else setError(res.error || 'Could not create account.');
  };

  const handleEmailSubmit = () => {
    if (isSignUp) handleEmailSignUp();
    else handleEmailLogin();
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError('');
    const res: any = await signInWithGoogle();
    setLoading(false);
    if (res.success) {
      if (!('redirecting' in res && res.redirecting)) onLogin();
    } else if (res.error !== 'auth/popup-closed-by-user') {
      setError(res.error || 'Google sign-in failed.');
    }
  };

  const handleForgotPassword = async () => {
    if (!emailOrUser.trim()) {
      setResetMode(true);
      setResetMessage('');
      setError('Enter the email address where you want the password reset link.');
      return;
    }
    setLoading(true);
    setError('');
    setResetMessage('');
    const res: any = await forgotPassword(emailOrUser.trim());
    setLoading(false);
    if (res.success) setResetMessage('Password reset link sent. Check your inbox and spam folder.');
    else setError(res.error || 'Failed to send password reset link.');
  };

  const handleSendOTP = async () => {
    if (!phone.trim() || phone.length < 10) {
      setError('Please enter a valid phone number.');
      return;
    }
    setLoading(true);
    setError('');
    const res: any = await sendPhoneOtp(`${countryCode}${phone}`);
    setLoading(false);
    if (res.success) {
      confirmationRef.current = res.confirmation || null;
      setOtp(['', '', '', '', '', '']);
      setActiveTab('otp');
    } else {
      setError(res.error || 'Failed to send OTP.');
    }
  };

  const handleVerifyOTP = async () => {
    const code = otp.join('');
    if (code.length < 6) {
      setError('Please enter the 6-digit OTP.');
      return;
    }
    if (!confirmationRef.current) {
      setError('Please request a new OTP.');
      return;
    }
    setLoading(true);
    setError('');
    const res: any = await confirmPhoneOtp(confirmationRef.current, code);
    setLoading(false);
    if (res.success) onLogin();
    else setError(res.error || 'OTP verification failed.');
  };

  const handleResendOTP = async () => {
    setError('');
    await handleSendOTP();
  };

  const handleOtpChange = (val: string, idx: number) => {
    const next = [...otp];
    next[idx] = val.replace(/[^0-9]/g, '').slice(-1);
    setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus?.();
    if (!val && idx > 0) otpRefs.current[idx - 1]?.focus?.();
  };

  const getLoginAction = () => {
    if (resetMode) {
      handleForgotPassword();
      return;
    }
    if (activeTab === 'email') handleEmailSubmit();
    else if (activeTab === 'phone') handleSendOTP();
    else handleVerifyOTP();
  };

  const getLoginLabel = () => {
    if (resetMode) return 'Send reset link';
    if (activeTab === 'phone') return 'Send OTP';
    if (activeTab === 'otp') return 'Verify OTP';
    return isSignUp ? 'Create Account' : 'Login';
  };

  return (
    <>
      {visible && (
        <Modal
          transparent={true}
          animationType="none"
          visible={visible}
          onRequestClose={onClose}
          statusBarTranslucent={true}
        >
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
          </Animated.View>
          <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top || 48 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.headerRow}>
                  <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={styles.brandBlock}>
                  <LocalizedText style={styles.flame}>🔥</LocalizedText>
                  <View style={styles.brandNameRow}>
                    <LocalizedText style={styles.brandNameMasti}>Masti</LocalizedText>
                    <View style={styles.brandVideoBox}>
                      <LocalizedText style={styles.brandVideoText}>Video</LocalizedText>
                    </View>
                  </View>
                  <LocalizedText style={styles.brandSub}>Entertainment</LocalizedText>
                </View>

                <View style={styles.tabBar}>
                  {(['email', 'phone', 'otp'] as const).map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
                      onPress={() => {
                        setActiveTab(tab);
                        clearError();
                      }}
                      activeOpacity={0.8}
                    >
                      <LocalizedText style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]} numberOfLines={1}>
                        {tab === 'email' ? 'Email' : tab === 'phone' ? 'Phone' : 'OTP'}
                      </LocalizedText>
                    </TouchableOpacity>
                  ))}
                </View>

                {activeTab === 'email' && (
                  <>
                    <View style={[styles.inputRow, !!error && styles.inputRowError]}>
                      <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                      <LocalizedTextInput
                        style={styles.input}
                        placeholder="Email or Username"
                        placeholderTextColor="#555"
                        value={emailOrUser}
                        onChangeText={(t: string) => {
                          setEmailOrUser(t);
                          clearError();
                          setResetMessage('');
                        }}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        returnKeyType="next"
                        editable={!loading}
                      />
                    </View>

                    {!resetMode && (
                      <View style={[styles.inputRow, !!error && styles.inputRowError]}>
                        <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                        <LocalizedTextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder="Password (6+ characters)"
                          placeholderTextColor="#555"
                          value={password}
                          onChangeText={(t: string) => {
                            setPassword(t.slice(0, 128));
                            clearError();
                          }}
                          secureTextEntry={!showPass}
                          autoCapitalize="none"
                          keyboardType="default"
                          maxLength={128}
                          returnKeyType="done"
                          onSubmitEditing={handleEmailSubmit}
                          editable={!loading}
                        />
                        <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                          <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color="#666" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {!isSignUp && !resetMode && (
                      <TouchableOpacity style={styles.forgotRow} onPress={handleForgotPassword}>
                        <LocalizedText style={styles.forgotText}>Forgot Password?</LocalizedText>
                      </TouchableOpacity>
                    )}

                    {resetMode ? (
                      <TouchableOpacity
                        style={styles.accountModeRow}
                        onPress={() => {
                          setResetMode(false);
                          setResetMessage('');
                          clearError();
                        }}
                        disabled={loading}
                      >
                        <LocalizedText style={styles.accountModeLink}>Back to Login</LocalizedText>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.accountModeRow}
                        onPress={() => {
                          setIsSignUp(!isSignUp);
                          clearError();
                          setResetMessage('');
                        }}
                        disabled={loading}
                      >
                        <LocalizedText style={styles.accountModeText}>
                          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                          <LocalizedText style={styles.accountModeLink}>
                            {isSignUp ? 'Login' : 'Create Account'}
                          </LocalizedText>
                        </LocalizedText>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {activeTab === 'phone' && (
                  <>
                    <View style={[styles.inputRow, !!error && styles.inputRowError]}>
                      <View style={styles.countryCodeBox}>
                        <LocalizedText style={styles.countryCodeText}>{countryCode}</LocalizedText>
                        <Ionicons name="chevron-down" size={16} color="#666" />
                      </View>
                      <View style={styles.countryDivider} />
                      <LocalizedTextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="Phone Number"
                        placeholderTextColor="#555"
                        value={phone}
                        onChangeText={(t: string) => {
                          setPhone(t.replace(/[^0-9]/g, ''));
                          clearError();
                        }}
                        keyboardType="phone-pad"
                        maxLength={10}
                        returnKeyType="done"
                        editable={!loading}
                      />
                    </View>
                    <LocalizedText style={styles.phoneHint}>We&apos;ll send an OTP to verify your number</LocalizedText>
                  </>
                )}

                {activeTab === 'otp' && (
                  <>
                    <LocalizedText style={styles.otpHint}>
                      {'Enter the 6-digit OTP sent to'}
                      {'\n'}
                      <LocalizedText style={styles.otpPhone}>
                        {countryCode} {phone || 'your number'}
                      </LocalizedText>
                    </LocalizedText>
                    <View style={styles.otpRow}>
                      {otp.map((digit, i) => (
                        <LocalizedTextInput
                          key={i}
                          ref={(r: any) => {
                            otpRefs.current[i] = r;
                          }}
                          style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                          value={digit}
                          onChangeText={(v: string) => handleOtpChange(v, i)}
                          keyboardType="number-pad"
                          maxLength={1}
                          textAlign="center"
                          selectTextOnFocus={true}
                          editable={!loading}
                        />
                      ))}
                    </View>
                    <TouchableOpacity style={styles.resendRow} onPress={handleResendOTP} disabled={loading}>
                      <LocalizedText style={styles.resendText}>
                        {"Didn't get OTP? "}
                        <LocalizedText style={styles.resendLink}>Resend</LocalizedText>
                      </LocalizedText>
                    </TouchableOpacity>
                  </>
                )}

                {!!error && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={15} color="#FF6B6B" />
                    <LocalizedText style={styles.errorText}>{error}</LocalizedText>
                  </View>
                )}

                {!!resetMessage && (
                  <View style={styles.successBox}>
                    <Ionicons name="checkmark-circle" size={15} color="#65D391" />
                    <LocalizedText style={styles.successText}>{resetMessage}</LocalizedText>
                  </View>
                )}

                <TouchableOpacity
                  onPress={getLoginAction}
                  activeOpacity={0.88}
                  style={[styles.loginBtnWrap, loading && styles.loginBtnDisabled]}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#FF2D55', '#FF2D55']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.loginBtn}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <LocalizedText style={styles.loginBtnText}>{getLoginLabel()}</LocalizedText>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <LocalizedText style={styles.dividerText}>or continue with</LocalizedText>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.socialRow}>
                  <TouchableOpacity style={styles.socialCircle} onPress={handleGoogle} disabled={loading}>
                    <LocalizedText style={styles.googleG}>G</LocalizedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.socialCircle}
                    onPress={() => {
                      setActiveTab('phone');
                      clearError();
                    }}
                    disabled={loading}
                  >
                    <Ionicons name="call" size={22} color="#FF2D55" />
                  </TouchableOpacity>
                </View>

                {Platform.OS === 'web' && <View nativeID="recaptcha-container" style={styles.recaptchaContainer} />}
              </ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0d0d0d',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerBtn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 32,
  },
  flame: {
    fontSize: 60,
    marginBottom: 10,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  brandNameMasti: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  brandVideoBox: {
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'transparent',
  },
  brandVideoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  brandSub: {
    color: '#999',
    fontSize: 15,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 30,
    padding: 4,
    marginBottom: 24,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 26,
  },
  tabItemActive: { backgroundColor: '#FF2D55' },
  tabLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 14,
    marginBottom: 14,
    height: 56,
  },
  inputRowError: { borderColor: '#FF6B6B' },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    height: '100%',
  },
  eyeBtn: { padding: 4 },
  countryCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 2,
  },
  countryCodeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  countryDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#333',
    marginRight: 12,
  },
  phoneHint: {
    color: '#666',
    fontSize: 12,
    marginTop: -6,
    marginBottom: 18,
    marginLeft: 4,
  },
  otpHint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 22,
  },
  otpPhone: {
    color: '#FF2D55',
    fontWeight: '700',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  otpBox: {
    width: 46,
    height: 54,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  otpBoxFilled: { borderColor: '#FF2D55' },
  resendRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  resendText: {
    color: '#888',
    fontSize: 13,
  },
  resendLink: {
    color: '#FF2D55',
    fontWeight: '700',
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 24,
    marginTop: -4,
  },
  forgotText: {
    color: '#FF2D55',
    fontSize: 13,
    fontWeight: '600',
  },
  accountModeRow: {
    alignItems: 'center',
    marginBottom: 22,
    marginTop: -6,
  },
  accountModeText: {
    color: '#888',
    fontSize: 13,
  },
  accountModeLink: {
    color: '#FF2D55',
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    flex: 1,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(101,211,145,0.12)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },
  successText: {
    color: '#65D391',
    fontSize: 13,
    flex: 1,
  },
  loginBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 28,
  },
  loginBtnDisabled: { opacity: 0.65 },
  loginBtn: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2a2a2a',
  },
  dividerText: {
    color: '#666',
    fontSize: 13,
    marginHorizontal: 12,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  socialCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 22,
    fontWeight: '800',
    color: '#EA4335',
  },
  recaptchaContainer: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
