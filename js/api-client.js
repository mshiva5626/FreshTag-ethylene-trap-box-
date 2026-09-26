/**
 * Smart FreshGuard - REST API Client & Seamless Backend Synchronization
 */

export class ApiClient {
  constructor(baseUrl = "") {
    // If opened via http://localhost:8080, baseUrl is relative ""; if standalone file://, point to localhost:8080
    this.baseUrl = baseUrl || (window.location.protocol.startsWith("http") ? "" : "http://localhost:8080");
    this.isConnected = false;
    this.onConnectionStatusChange = null;
  }

  async checkServerHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/api/telemetry/latest`, { method: "GET", cache: "no-store" });
      const ok = res.ok;
      this.updateStatus(ok);
      return ok;
    } catch (e) {
      this.updateStatus(false);
      return false;
    }
  }

  updateStatus(status) {
    if (this.isConnected !== status) {
      this.isConnected = status;
      if (this.onConnectionStatusChange) {
        this.onConnectionStatusChange(status);
      }
    }
  }

  async getLatestTelemetry() {
    try {
      const res = await fetch(`${this.baseUrl}/api/telemetry/latest`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.updateStatus(true);
      return await res.json();
    } catch (err) {
      this.updateStatus(false);
      return null;
    }
  }

  async getHistory() {
    try {
      const res = await fetch(`${this.baseUrl}/api/telemetry/history`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async postTelemetry(payload) {
    try {
      const res = await fetch(`${this.baseUrl}/api/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  async sendControl(controlPayload) {
    try {
      const res = await fetch(`${this.baseUrl}/api/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(controlPayload)
      });
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async getConfig() {
    try {
      const res = await fetch(`${this.baseUrl}/api/config`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async saveConfig(config) {
    try {
      const res = await fetch(`${this.baseUrl}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config, null, 2)
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  }
}
