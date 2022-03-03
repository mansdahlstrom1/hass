class RoomCard extends HTMLElement {

  setConfig(config) {
    console.log('set config');

    if (!config.group) {
      throw new Error('Please specify a group');
    }

    console.log(config);

    console.log(this.lastChild);

    if (this.lastChild) this.removeChild(this.lastChild);
    const cardConfig = Object.assign({}, config);
    if (!cardConfig.card) cardConfig.card = {};
    if (!cardConfig.card.type) cardConfig.card.type = 'entities';
    const element = document.createElement(`hui-${cardConfig.card.type}-card`);
    this.appendChild(element);
    this._config = JSON.parse(JSON.stringify(cardConfig));
    console.log(this._config);
  }

  set hass(hass) {
    console.log('hass');
    const config = this._config;
    const entities = hass.states[config.group].attributes['entity_id'];
    console.log('entities',   entities);
    if (!config.card.entities || config.card.entities.length !== entities.length ||
      !config.card.entities.every((value, index) => value.entity === entities[index].entity)) {
      config.card.entities = entities;
    }
    this.lastChild.setConfig(config.card);
    this.lastChild.hass = hass;
  }

  getCardSize() {
    return 'getCardSize' in this.lastChild ? this.lastChild.getCardSize() : 1;
  }
}

customElements.define('room-card', RoomCard);
