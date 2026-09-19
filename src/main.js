import { mountApp } from "./app.js";

mountApp(document, {
  storage: {
    getItem(key) {
      return window.localStorage.getItem(key);
    },
    setItem(key, value) {
      window.localStorage.setItem(key, value);
    },
  },
});
