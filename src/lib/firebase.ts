import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Firebase configuration for eventista-toy-prj
const firebaseConfig = {
  apiKey: "AIzaSyDjoRjeB0yTi9i6dVmLgOF_KtPYdYO72j4",
  authDomain: "eventista-toy-prj.firebaseapp.com",
  databaseURL:
    "https://eventista-toy-prj-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "eventista-toy-prj",
  storageBucket: "eventista-toy-prj.firebasestorage.app",
  messagingSenderId: "155326730117",
  appId: "1:155326730117:web:64d32efb3f3dc7e70ffeec",
  measurementId: "G-6JS46Q870J",
};

// Initialize Firebase
let app;
let database;

try {
  app = initializeApp(firebaseConfig);
  database = getDatabase(app);
} catch (error) {
  console.warn("Firebase initialization failed, falling back to localStorage");
  database = null;
}

export { database };
export default app;
