/**
 * Smart FreshGuard - History Logger & Data Export
 */

export class HistoryLogger {
  constructor(tableBodyId) {
    this.tableBody = document.getElementById(tableBodyId);
    this.records = [];
    this.searchTerm = "";
  }

  setRecords(records) {
    this.records = records || [];
    this.render();
  }

  addRecord(record) {
    this.records.unshift(record);
    if (this.records.length > 500) {
      this.records.pop();
    }
    this.render();
  }

  setSearch(term) {
    this.searchTerm = (term || "").toLowerCase();
    this.render();
  }

  getFilteredRecords() {
    if (!this.searchTerm) return this.records;
    return this.records.filter(r => {
      return (
        (r.door_status && r.door_status.toLowerCase().includes(this.searchTerm)) ||
        (r.state && r.state.toLowerCase().includes(this.searchTerm)) ||
        (r.timestamp && r.timestamp.toLowerCase().includes(this.searchTerm)) ||
        (r.system_mode && r.system_mode.toLowerCase().includes(this.searchTerm))
      );
    });
  }

  render() {
    if (!this.tableBody) return;
    const filtered = this.getFilteredRecords().slice(0, 25); // show top 25

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2rem;">No telemetry records found</td></tr>`;
      return;
    }

    this.tableBody.innerHTML = filtered.map(row => {
      const timeStr = row.timestamp ? (row.timestamp.includes("T") ? row.timestamp.split("T")[1].slice(0, 8) : row.timestamp) : "--";
      const isDoorOpen = row.door_status === "OPEN";
      const isFanOn = (row.inlet_fan === "ON" || row.outlet_fan === "ON");
      const isHumOn = row.humidifier === "ON";

      return `
        <tr>
          <td><span style="font-family: var(--font-mono); font-weight: 600;">${timeStr}</span></td>
          <td><span style="font-family: var(--font-mono); font-weight: 700;">${row.temperature}°C</span></td>
          <td><span style="font-family: var(--font-mono); font-weight: 700;">${row.humidity}%</span></td>
          <td><span style="font-family: var(--font-mono); font-weight: 700; color: ${row.gas_level > 250 ? '#EF4444' : '#F59E0B'}">${row.gas_level} ppm</span></td>
          <td>
            <span class="status-chip ${isDoorOpen ? 'chip-open' : 'chip-closed'}">
              ${isDoorOpen ? '🚪 OPEN' : '🔒 CLOSED'}
            </span>
          </td>
          <td>
            <span class="status-chip ${isFanOn ? 'chip-on' : 'chip-off'}">
              ${isFanOn ? 'ON' : 'OFF'}
            </span>
          </td>
          <td>
            <span class="status-chip ${isHumOn ? 'chip-on' : 'chip-off'}">
              ${isHumOn ? 'ON' : 'OFF'}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  exportCSV() {
    const headers = ["Timestamp", "Device_ID", "Door_Status", "State", "Temperature_C", "Humidity_Pct", "Gas_Level_PPM", "System_Mode", "Inlet_Fan", "Outlet_Fan", "Humidifier", "White_LED", "Blue_LED"];
    const rows = this.records.map(r => [
      `"${r.timestamp || ''}"`,
      `"${r.device_id || 'SF-001'}"`,
      `"${r.door_status || ''}"`,
      `"${r.state || ''}"`,
      r.temperature,
      r.humidity,
      r.gas_level,
      `"${r.system_mode || 'AUTO'}"`,
      `"${r.inlet_fan || 'OFF'}"`,
      `"${r.outlet_fan || 'OFF'}"`,
      `"${r.humidifier || 'OFF'}"`,
      `"${r.white_led || 'OFF'}"`,
      `"${r.blue_led || 'OFF'}"`
    ].join(","));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `FreshGuard_Telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.records, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `FreshGuard_Telemetry_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}
