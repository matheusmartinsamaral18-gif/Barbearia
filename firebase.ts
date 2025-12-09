import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCpUHG-bwd8duQP-KlowvxPsm7zYCJ0hg0",
  authDomain: "barbeiro-d1e6d.firebaseapp.com",
  projectId: "barbeiro-d1e6d",
  storageBucket: "barbeiro-d1e6d.firebasestorage.app",
  messagingSenderId: "445702849426",
  appId: "1:445702849426:web:ab950ceb8ce4dc2b1b374b",
  measurementId: "G-KY85BWWSS1"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Initialize messaging only if supported (browser environment)
export const initMessaging = async () => {
  try {
    const supported = await isSupported();
    if (supported) {
      return getMessaging(app);
    }
  } catch (e) {
    console.log('Messaging not supported in this environment');
  }
  return null;
};
