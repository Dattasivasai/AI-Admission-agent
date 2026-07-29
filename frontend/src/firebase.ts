// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBTk4PWEODdM_iqPDo7AnwO9ZPYeS7KGfE",
  authDomain: "ai-agent-admissions.firebaseapp.com",
  projectId: "ai-agent-admissions",
  storageBucket: "ai-agent-admissions.firebasestorage.app",
  messagingSenderId: "866241301985",
  appId: "1:866241301985:web:8b8776d6d64bf8b87056a0",
  measurementId: "G-8KQ03J8SEH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();