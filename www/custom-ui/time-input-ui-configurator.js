import {
  LitElement,
} from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";

class TimeInputConfigurator extends LitElement {
  setConfig(config) {
    this._config = config;
  }

  configChanged(newConfig) {
    const event = new Event("config-changed", {
      bubbles: true,
      composed: true,
    });
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
  }
}

customElements.define("time-input-ui-configurator", TimeInputConfigurator);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "time-input-card",
  name: "Time Input Card",
  preview: true, // Optional - defaults to false
  description: "A custom card made by me!", // Optional
});
