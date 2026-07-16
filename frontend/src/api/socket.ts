import { io } from 'socket.io-client';

const isDev = import.meta.env.DEV;
const socketUrl = isDev ? 'http://localhost:8080' : window.location.origin;

export const socket = io(socketUrl, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
});
