import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTk4PWEODdM_iqPDo7AnwO9ZPYeS7KGfE",
  authDomain: "ai-agent-admissions.firebaseapp.com",
  projectId: "ai-agent-admissions",
  storageBucket: "ai-agent-admissions.firebasestorage.app",
  messagingSenderId: "866241301985",
  appId: "1:866241301985:web:8b8776d6d64bf8b87056a0",
  measurementId: "G-8KQ03J8SEH",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);