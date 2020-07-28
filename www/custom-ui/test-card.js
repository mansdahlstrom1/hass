const css = `
  .big-icon {
    width: 60px;
    height: 60px;
  }
`;

class TestCard extends HTMLElement {
  set hass(hass) {
    if (!this.content) {
      const card = document.createElement('ha-card');
      const style = document.createElement('style');
      style.textContent = css;
      card.appendChild(style);
      
      this.content = document.createElement('div');
      this.content.style.padding = '0 16px 16px';
      
      card.appendChild(this.content);
      this.appendChild(card);
    }
    console.log(hass);

    const {
      attributes,
    } = hass.states[this.config.entity];
    console.log(attributes);

    this.content.innerHTML= `
      <ha-icon class="big-icon" icon="mdi:weather-${attributes.forecast[0].condition}"> </ha-icon>
      ${attributes.temperature}
    `;
  }

  setConfig(config) {
    console.log(config);
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    this.config = config;
  }

  // The height of your card. Home Assistant uses this to automatically
  // distribute all cards over the available columns.
  getCardSize() {
    return 20;
  }
}

customElements.define('test-card', TestCard);