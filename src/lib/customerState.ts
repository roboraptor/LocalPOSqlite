// c:\projects\LocalPOSjson\src\lib\customerState.ts
import { Item } from "../types/db";

export interface CustomerState {
  receipt: Item[];
  activeTab: any;
  showQRModal: boolean;
  spaydString: string;
  externalQrUrl: string | null;
  status: "pending" | "completed";
  fullscreenToggleId?: number;
  fullscreenAction?: "toggle" | "enter";
}

const globalForCustomerState = global as unknown as {
  customerState: CustomerState | undefined;
  customerClients: Set<ReadableStreamDefaultController> | undefined;
};

if (!globalForCustomerState.customerState) {
  globalForCustomerState.customerState = {
    receipt: [],
    activeTab: null,
    showQRModal: false,
    spaydString: "",
    externalQrUrl: null,
    status: "pending",
    fullscreenToggleId: 0,
    fullscreenAction: "toggle",
  };
}

if (!globalForCustomerState.customerClients) {
  globalForCustomerState.customerClients = new Set();
}

export const customerState = globalForCustomerState.customerState;
export const customerClients = globalForCustomerState.customerClients;

export function addClient(client: ReadableStreamDefaultController) {
  customerClients.add(client);
  // Send the current state immediately on connect
  sendToClient(client, customerState);
}

export function removeClient(client: ReadableStreamDefaultController) {
  customerClients.delete(client);
}

export function updateState(newState: Partial<CustomerState>) {
  Object.assign(customerState, newState);
  notifyAll(customerState);
}

export function getState() {
  return customerState;
}

function sendToClient(client: ReadableStreamDefaultController, state: CustomerState) {
  try {
    const encoder = new TextEncoder();
    const data = `data: ${JSON.stringify(state)}\n\n`;
    client.enqueue(encoder.encode(data));
  } catch (err) {
    console.error("[CustomerState] Failed to send data to client, removing client", err);
    customerClients.delete(client);
  }
}

function notifyAll(state: CustomerState) {
  for (const client of customerClients) {
    sendToClient(client, state);
  }
}
