import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";

class TimeInputCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {
        presets: [],
      },
    };
  }

  static getStubConfig() {
    return {
      title: 'Alarm Time',
      presets: ["06:30", "07:00", "07:30", "08:00"],
      entity_id: ''
    }
  }

  static getConfigElement() {
    return document.createElement("time-input-ui-configurator");
  }

  // The user supplied configuration. Throw an exception and Home Assistant
  // will render an error card.
  setConfig(config) {
    this.config = config;
  }

  // The height of your card. Home Assistant uses this to automatically
  // distribute all cards over the available columns.
  getCardSize() {
    return 1;
  }

  log(...args) {
    console.log("[TimeInputCard]", ...args);
  }

  updateEntityState(value) {
    const entity = this.getEntity();

    this.hass.callService("input_text", "set_value", {
      entity_id: entity.entity_id,
      value,
    })
  }

  // onPresetClick(event) {
  //   updateEntityState(event.target.value)
  // }

  getEntity() {
    return this.hass.states[this.config.entity_id];
  }

  render() {
    const entity = this.getEntity();
    const presets = [...new Set(this.config?.presets ?? [])];

    return html`
      <ha-card header="${this.config.title}">
        <div class="card-content">
          <div class="time-card-input-wrapper">
            <input
              value="${entity.state}"
              @change="${(e) => this.updateEntityState(e.target.value)}"
              id="time-input"
              type="time"
              name="time-input"
            />
          </div>
          <div class="time-card-input-button-container">
            ${(presets ?? []).map((time) => {
              const active = entity.state === time;
              const btnClass = active ? 'active-btn' : 'inactive-btn';

              return html`
                <button
                  class="time-card-input-preset-btn ${btnClass}"
                  @click=${(e) => this.updateEntityState(e.target.value)}
                  key="preset-${time}"
                  name="preset-${time}"
                  value="${time}"
                  ?disabled="${active}"
                >
                  ${time}
                </button>
              `;
            })}
          </div>
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      #time-input {
        background: transparent;
        border: 0;
        font-size: 3rem;
        color: var(--primary-text-color);
      }

      #time-input::-webkit-calendar-picker-indicator {
        background: none;
        display: none;
      }

      .card-content {
        padding: 1rem;
      }

      .time-card-input-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        padding-top: 0px;
        margin-top: -8px;
        padding-bottom: 1rem;
      }

      .time-card-input-button-container {
        display: flex;
        flex-direction: row;
        justify-content: space-around;
        align-items: center;
      }

      .time-card-input-preset-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 1rem;
        border: 2px solid;
        background: transparent;
        transition: background-color 280ms ease-in-out 0s;
        font-size: var(--control-height);
        box-sizing: border-box;
        font-weight: 600;
        padding: 0.25rem 1rem;
        cursor: pointer;
      }

      .time-card-input-preset-btn.inactive-btn {
        color: var(--primary-text-color);
        border-color: var(--primary-text-color);
      }

      .time-card-input-preset-btn.active-btn {
        color: var(--text-primary-color);
        border-color: var(--primary-color);
        background: var(--primary-color);
      }

      .time-card-input-preset-btn:active {
        background: var(--primary-color);
      }
      .time-card-input-preset-btn:disabled {
        cursor: not-allowed;
      }
    `;
  }
}

customElements.define("time-input-card", TimeInputCard);
