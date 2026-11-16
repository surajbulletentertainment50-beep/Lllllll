import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  RecaptchaVerifier,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';

const app =
  getApps().length === 0
    ? initializeApp({
        apiKey: 'AIzaSyCpTSbVg9OR6cnu5i4U2Iq40kAZrVBYOx4',
        authDomain: 'masti-video-24740.firebaseapp.com',
        projectId: 'masti-video-24740',
        storageBucket: 'masti-video-24740.firebasestorage.app',
        messagingSenderId: '669297294909',
        appId: '1:669297294909:android:b75d451c103922904db454',
      })
    : getApps()[0];

let _auth: ReturnType<typeof getAuth> | null = null;
try {
  _auth = getAuth(app);
  void setPersistence(_auth, browserLocalPersistence).catch(() => {});
} catch (err) {
  console.warn('[Firebase Auth] getAuth deferred or failed:', err);
}
export const auth = _auth;

let _googleProvider: GoogleAuthProvider | null = null;
try {
  _googleProvider = new GoogleAuthProvider();
  _googleProvider.setCustomParameters({ prompt: 'select_account' });
} catch (err) {
  console.warn('[Firebase Auth] GoogleAuthProvider init warning:', err);
}
export const googleProvider = _googleProvider;

const GOOGLE_REDIRECT_PENDING_KEY = '@masti_google_redirect_pending';
let activeRecaptchaVerifier: RecaptchaVerifier | null = null;

const friendlyFirebaseAuthError = (err: any, fallback = 'Authentication failed.'): string => {
  const code = String(err?.code || '').trim();
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'auth/popup-closed-by-user';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Galat email ya password. Dobara check karein.';
    case 'auth/user-not-found':
      return 'Is email se koi Firebase account nahi mila. Pehle "Create Account" karein.';
    case 'auth/email-already-in-use':
      return 'Yeh email pehle se registered hai. Kripya Login karein.';
    case 'auth/weak-password':
      return 'Password kam se kam 6 characters ka hona chahiye.';
    case 'auth/invalid-email':
      return 'Sahi email address daalein.';
    case 'auth/too-many-requests':
      return 'Bahut zyada attempts ho gaye hain. Thodi der baad try karein.';
    case 'auth/unauthorized-domain':
      return 'Yeh domain Firebase Authorized Domains mein add nahi hai.';
    case 'auth/operation-not-allowed':
      return 'Yeh login method Firebase Console mein enabled nahi hai.';
    case 'auth/invalid-phone-number':
      return 'Sahi phone number daalein (e.g. +91XXXXXXXXXX).';
    case 'auth/invalid-verification-code':
      return 'Galat 6-digit OTP hai. Sahi OTP daalein.';
    case 'auth/code-expired':
      return 'OTP expire ho gaya hai. Naya OTP bhejein.';
    case 'auth/network-request-failed':
      return 'Network error. Internet connection check karein.';
    default:
      return err?.message ? String(err.message) : fallback;
  }
};

const toAppUser = (fbUser: any) => ({
  uid: fbUser.uid,
  email: fbUser.email || (fbUser.phoneNumber ? `${fbUser.phoneNumber.replace(/\D/g, '')}@phone.firebase.masti.in` : ''),
  phoneNumber: fbUser.phoneNumber || '',
  displayName:
    fbUser.displayName ||
    (fbUser.email ? fbUser.email.split('@')[0] : fbUser.phoneNumber ? `User ${fbUser.phoneNumber.slice(-4)}` : 'Masti User'),
  photoURL: fbUser.photoURL || '',
  emailVerified: Boolean(fbUser.emailVerified),
  providerId: fbUser.providerData?.[0]?.providerId || 'firebase',
});

export async function syncUserWithMastiBase(firebaseUser: any) {
  try {
    const uid = String(firebaseUser?.uid || '').trim();
    const email = String(firebaseUser?.email || (uid ? `${uid}@masti.in` : ''))
      .trim()
      .toLowerCase();
    let storedProfile: any = {};
    let storedCore: any = {};
    let savedDp = '';
    try {
      if (uid) {
        const raw = localStorage.getItem(`@masti_profile_${uid}`);
        if (raw) storedProfile = JSON.parse(raw) || {};
        const rawCore = localStorage.getItem(`@masti_profile_core_${uid}`);
        if (rawCore) storedCore = JSON.parse(rawCore) || {};
        savedDp = localStorage.getItem(`@masti_profile_dp_${uid}`) || '';
      }
      if (!savedDp) savedDp = localStorage.getItem('@masti_saved_profile_dp') || '';
    } catch {}

    const rawHandle = String(
      storedCore.userId ||
        storedCore.username ||
        storedProfile.userId ||
        storedProfile.username ||
        (email ? email.split('@')[0] : '') ||
        (uid ? `user_${uid.substring(0, 6)}` : 'creator'),
    )
      .trim()
      .replace(/^@+/, '');

    const handleWithAt = !(!rawHandle || /^(user|newuser)$/i.test(rawHandle)) ? `@${rawHandle}` : '';
    const displayName = String(storedCore.name || storedProfile.name || firebaseUser?.displayName || '').trim();
    const candidateAvatar = String(
      storedCore.profileImage || storedProfile.profileImage || savedDp || firebaseUser?.photoURL || '',
    ).trim();

    const validAvatar =
      candidateAvatar &&
      /^https?:\/\//i.test(candidateAvatar) &&
      !/dicebear|bottts|robohash|images\.unsplash\.com\/photo-1534528741775/i.test(candidateAvatar)
        ? candidateAvatar
        : '';

    const loginBody: any = {
      firebaseUid: uid,
      email,
      name: handleWithAt || displayName || 'Masti Creator',
      username: rawHandle || undefined,
    };
    if (validAvatar) loginBody.avatarUrl = validAvatar;

    const loginJson = await (
      await fetch('https://masti-basen.lovable.app/api/auth/firebase-login', {
        method: 'POST',
        headers: {
          'x-api-key': 'mb_live_rajkali_8789_7b31a6fe89d24643',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginBody),
      })
    )
      .json()
      .catch(() => null);

    const resolvedMbId = String(loginJson?.mastiBaseUserId || loginJson?.user?.id || '').trim();
    if (resolvedMbId) {
      try {
        if (email) localStorage.setItem(`@masti_uid_map_${email}`, resolvedMbId);
        if (uid) {
          const existingRaw = localStorage.getItem(`@masti_profile_${uid}`);
          if (existingRaw) {
            const parsed = JSON.parse(existingRaw);
            if (parsed && typeof parsed === 'object' && parsed.mastiBaseUserId !== resolvedMbId) {
              parsed.mastiBaseUserId = resolvedMbId;
              localStorage.setItem(`@masti_profile_${uid}`, JSON.stringify(parsed));
            }
          }
        }
      } catch {}
    }

    if (email && (handleWithAt || validAvatar)) {
      const syncBody: any = {
        email,
        userId: resolvedMbId || storedCore.mastiBaseUserId || email,
        firebaseUid: uid,
        userName: handleWithAt || displayName || rawHandle,
        name: handleWithAt || displayName || rawHandle,
        username: rawHandle || undefined,
        bio: storedCore.bio ?? storedProfile.bio ?? '',
      };
      if (validAvatar) {
        syncBody.userAvatar = validAvatar;
        syncBody.avatarUrl = validAvatar;
      }
      fetch('https://masti-basen.lovable.app/api/v1/social/user/sync', {
        method: 'POST',
        headers: {
          'x-api-key': 'mb_live_rajkali_8789_7b31a6fe89d24643',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(syncBody),
      }).catch(() => {});
    }
    return loginJson;
  } catch (err) {
    console.warn('[Firebase Auth] MastiBase sync error:', err);
    return null;
  }
}

let currentUser: any = auth?.currentUser ? toAppUser(auth.currentUser) : null;
let firebaseAuthResolved = Boolean(auth?.currentUser);

// Clean out any legacy non-Firebase fallback sessions
try {
  const savedRaw = localStorage.getItem('@masti_current_user');
  if (savedRaw) {
    const parsed = JSON.parse(savedRaw);
    if (
      !parsed?.uid ||
      /^usr_(google|phone)_/.test(String(parsed.uid)) ||
      parsed.email === 'google_user@gmail.com'
    ) {
      localStorage.removeItem('@masti_current_user');
    }
  }
} catch {}

const authListeners: Array<(user: any) => void> = [];

try {
  if (auth) {
    firebaseOnAuthStateChanged(auth, async (fbUser) => {
      firebaseAuthResolved = true;
      if (fbUser) {
        const appUser = toAppUser(fbUser);
        currentUser = appUser;
        try {
          localStorage.setItem('@masti_current_user', JSON.stringify(appUser));
        } catch {}
        await syncUserWithMastiBase(fbUser);
        authListeners.forEach((fn) => fn(appUser));
      } else {
        currentUser = null;
        try {
          localStorage.removeItem('@masti_current_user');
        } catch {}
        authListeners.forEach((fn) => fn(null));
      }
    });
  } else {
    firebaseAuthResolved = true;
  }
} catch (e) {
  firebaseAuthResolved = true;
  console.warn('[Firebase Auth Init] Listener error:', e);
}

export const appAuth = {
  get currentUser() {
    if (auth?.currentUser) {
      return toAppUser(auth.currentUser);
    }
    return currentUser;
  },
};

export const onAuthStateChanged = (_auth: any, callback: (user: any) => void) => {
  authListeners.push(callback);
  if (firebaseAuthResolved) {
    setTimeout(() => {
      callback(appAuth.currentUser);
    }, 0);
  }
  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx !== -1) authListeners.splice(idx, 1);
  };
};

export const signOutUser = async () => {
  currentUser = null;
  try {
    localStorage.removeItem('@masti_current_user');
    localStorage.removeItem('@masti_saved_profile_dp');
    localStorage.setItem('@masti_just_logged_out', '1');
  } catch {}
  try {
    if (auth) await Promise.race([signOut(auth), new Promise((resolve) => setTimeout(resolve, 2500))]);
  } catch {}
  authListeners.forEach((fn) => fn(null));
  return { success: true };
};

export const signInUser = async (user: any) => {
  if (!auth?.currentUser || !user?.uid || auth.currentUser.uid !== user.uid) {
    return null;
  }
  currentUser = user;
  try {
    localStorage.setItem('@masti_current_user', JSON.stringify(user));
  } catch {}
  authListeners.forEach((fn) => fn(currentUser));
  return user;
};

export const loadOrCreateUserProfile = async (accountIdOrUser: any, savedData?: any) => {
  const uid =
    typeof accountIdOrUser === 'string'
      ? accountIdOrUser
      : accountIdOrUser?.uid || accountIdOrUser?.id || 'creator_account';
  const userObj = typeof accountIdOrUser === 'object' && accountIdOrUser !== null ? accountIdOrUser : currentUser || {};
  let storedUser: any = {};
  let savedGlobalDp = '';
  try {
    const raw = localStorage.getItem(`@masti_profile_${uid}`);
    if (raw) storedUser = JSON.parse(raw);
    savedGlobalDp = localStorage.getItem('@masti_saved_profile_dp') || '';
  } catch {}

  const rawDp = savedData?.profileImage || storedUser?.profileImage || savedGlobalDp || userObj?.photoURL || '';
  const persistentDp = rawDp && !/dicebear|bottts|robohash/i.test(rawDp) ? rawDp : '';
  const merged = {
    accountId: uid,
    userId:
      savedData?.userId ||
      storedUser?.userId ||
      (userObj.email ? `@${userObj.email.split('@')[0]}` : `@user_${uid.slice(0, 6)}`),
    username:
      savedData?.username ||
      storedUser?.username ||
      (userObj.email ? userObj.email.split('@')[0] : `user_${uid.slice(0, 6)}`),
    name: savedData?.name || storedUser?.name || userObj.displayName || 'Masti Creator',
    email: savedData?.email || storedUser?.email || userObj.email || '',
    profileImageUploadUri: savedData?.profileImageUploadUri || storedUser?.profileImageUploadUri || null,
    bio: savedData?.bio ?? storedUser?.bio ?? 'Short video creator on Masti 🇮🇳',
    likes: savedData?.likes ?? storedUser?.likes ?? 0,
    isVerified: Boolean(savedData?.isVerified ?? storedUser?.isVerified ?? false),
    youtube: savedData?.youtube || storedUser?.youtube || '',
    instagram: savedData?.instagram || storedUser?.instagram || '',
    ...savedData,
    ...storedUser,
    followers:
      savedData?.followers === 1420 ||
      savedData?.followers === 1421 ||
      storedUser?.followers === 1420 ||
      storedUser?.followers === 1421
        ? 0
        : typeof savedData?.followers === 'number'
        ? savedData.followers
        : typeof storedUser?.followers === 'number'
        ? storedUser.followers
        : 0,
    following:
      savedData?.following === 156 || storedUser?.following === 156
        ? 0
        : typeof savedData?.following === 'number'
        ? savedData.following
        : typeof storedUser?.following === 'number'
        ? storedUser.following
        : 0,
    profileImage: persistentDp,
  };
  return {
    profile: merged,
    usernameReassigned: false,
    ...merged,
  };
};

export const isGoogleRedirectPending = (): boolean => {
  try {
    return sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === '1';
  } catch {
    return false;
  }
};

export const completeGoogleRedirectSignIn = async () => {
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    try {
      sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
    } catch {}
    if (result?.user) {
      const appUser = toAppUser(result.user);
      currentUser = appUser;
      try {
        localStorage.setItem('@masti_current_user', JSON.stringify(appUser));
      } catch {}
      await syncUserWithMastiBase(result.user);
      authListeners.forEach((fn) => fn(appUser));
      return { success: true, user: appUser };
    }
    return null;
  } catch (err: any) {
    try {
      sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
    } catch {}
    const msg = friendlyFirebaseAuthError(err, 'Google redirect sign-in failed.');
    if (msg === 'auth/popup-closed-by-user') return null;
    return { success: false, error: msg };
  }
};

export const signInWithEmail = async (emailOrUser: string, pass: string) => {
  try {
    if (!auth) throw new Error('Firebase Auth unavailable');
    const cleanInput = String(emailOrUser || '').trim();
    const email = cleanInput.includes('@') ? cleanInput : `${cleanInput.toLowerCase()}@masti.in`;
    const fbUser = (await signInWithEmailAndPassword(auth, email, pass)).user;
    const appUser = toAppUser(fbUser);
    currentUser = appUser;
    try {
      localStorage.setItem('@masti_current_user', JSON.stringify(appUser));
    } catch {}
    await syncUserWithMastiBase(fbUser);
    authListeners.forEach((fn) => fn(appUser));
    return { success: true, user: appUser };
  } catch (err: any) {
    console.warn('[Firebase Auth] signInWithEmail error:', err);
    return {
      success: false,
      error: friendlyFirebaseAuthError(err, 'Email login failed.'),
      code: err?.code,
    };
  }
};

export const signUpWithEmail = async (emailInput: string, pass: string) => {
  try {
    if (!auth) throw new Error('Firebase Auth unavailable');
    const cleanInput = String(emailInput || '').trim();
    const email = cleanInput.includes('@') ? cleanInput : `${cleanInput.toLowerCase()}@masti.in`;
    const fbUser = (await createUserWithEmailAndPassword(auth, email, pass)).user;
    const appUser = toAppUser(fbUser);
    currentUser = appUser;
    try {
      localStorage.setItem('@masti_current_user', JSON.stringify(appUser));
    } catch {}
    await syncUserWithMastiBase(fbUser);
    authListeners.forEach((fn) => fn(appUser));
    return { success: true, user: appUser };
  } catch (err: any) {
    console.warn('[Firebase Auth] signUpWithEmail error:', err);
    return {
      success: false,
      error: friendlyFirebaseAuthError(err, 'Account create nahi ho saka.'),
      code: err?.code,
    };
  }
};

export const signInWithGoogle = async () => {
  try {
    if (!auth || !googleProvider) throw new Error('Firebase Auth unavailable');
    const fbUser = (await signInWithPopup(auth, googleProvider)).user;
    const appUser = toAppUser(fbUser);
    currentUser = appUser;
    try {
      localStorage.setItem('@masti_current_user', JSON.stringify(appUser));
    } catch {}
    await syncUserWithMastiBase(fbUser);
    authListeners.forEach((fn) => fn(appUser));
    return { success: true, user: appUser };
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try {
        if (auth && googleProvider) {
          sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, '1');
          await signInWithRedirect(auth, googleProvider);
          return { success: true, redirecting: true };
        }
      } catch (redirectErr: any) {
        try {
          sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
        } catch {}
        return {
          success: false,
          error: friendlyFirebaseAuthError(redirectErr, 'Google Sign-In failed.'),
          code: redirectErr?.code,
        };
      }
    }
    console.warn('[Firebase Auth] Google sign-in error:', err);
    return {
      success: false,
      error: friendlyFirebaseAuthError(err, 'Google Sign-In failed.'),
      code,
    };
  }
};

const ensureRecaptchaContainerElement = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('recaptcha-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'recaptcha-container';
    el.style.position = 'fixed';
    el.style.bottom = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  return el;
};

export const sendPhoneOtp = async (phone: string) => {
  try {
    if (!auth) throw new Error('Firebase Auth unavailable');
    const formattedPhone = String(phone || '').trim();
    if (!/^\+\d{10,15}$/.test(formattedPhone)) {
      return { success: false, error: 'Sahi phone number daalein (e.g. +91XXXXXXXXXX).' };
    }
    if (activeRecaptchaVerifier) {
      try {
        activeRecaptchaVerifier.clear();
      } catch {}
      activeRecaptchaVerifier = null;
    }
    const container = ensureRecaptchaContainerElement();
    if (!container) {
      return { success: false, error: 'Phone verification container load nahi hua.' };
    }
    activeRecaptchaVerifier = new RecaptchaVerifier(auth, container, { size: 'invisible' });
    const confirmation = await signInWithPhoneNumber(auth, formattedPhone, activeRecaptchaVerifier);
    return { success: true, confirmation };
  } catch (err: any) {
    if (activeRecaptchaVerifier) {
      try {
        activeRecaptchaVerifier.clear();
      } catch {}
      activeRecaptchaVerifier = null;
    }
    console.warn('[Firebase Auth] sendPhoneOtp error:', err);
    return {
      success: false,
      error: friendlyFirebaseAuthError(err, 'OTP nahi bheja ja saka.'),
      code: err?.code,
    };
  }
};

export const confirmPhoneOtp = async (confirmation: any, code: string) => {
  try {
    if (!confirmation || typeof confirmation.confirm !== 'function') {
      return { success: false, error: 'Kripya naya OTP request karein.' };
    }
    const result = await confirmation.confirm(String(code || '').trim());
    const fbUser = result?.user;
    if (!fbUser) {
      return { success: false, error: 'OTP verify nahi ho saka.' };
    }
    const appUser = toAppUser(fbUser);
    currentUser = appUser;
    try {
      localStorage.setItem('@masti_current_user', JSON.stringify(appUser));
    } catch {}
    await syncUserWithMastiBase(fbUser);
    authListeners.forEach((fn) => fn(appUser));
    return { success: true, user: appUser };
  } catch (err: any) {
    console.warn('[Firebase Auth] confirmPhoneOtp error:', err);
    return {
      success: false,
      error: friendlyFirebaseAuthError(err, 'OTP verification failed.'),
      code: err?.code,
    };
  }
};

export const forgotPassword = async (emailInput: string) => {
  try {
    if (!auth) throw new Error('Firebase Auth unavailable');
    const cleanEmail = String(emailInput || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Password reset ke liye apna sahi email daalein.' };
    }
    await sendPasswordResetEmail(auth, cleanEmail);
    return { success: true };
  } catch (err: any) {
    console.warn('[Firebase Auth] forgotPassword error:', err);
    return {
      success: false,
      error: friendlyFirebaseAuthError(err, 'Password reset email nahi bheja ja saka.'),
    };
  }
};
