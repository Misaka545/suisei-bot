const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const suits = ["♠️", "♥️", "♦️", "♣️"];

class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
  }

  toString() {
    return `${this.rank}${this.suit}`;
  }

  getValue() {
    if (["J", "Q", "K"].includes(this.rank)) return 10;
    if (this.rank === "A") return 11; // Initially 11, can be 1 later
    return parseInt(this.rank);
  }
}

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
    this.shuffle();
  }

  reset() {
    this.cards = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        this.cards.push(new Card(rank, suit));
      }
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal() {
    if (this.cards.length === 0) {
      this.reset();
      this.shuffle();
    }
    return this.cards.pop();
  }
}

class Hand {
  constructor() {
    this.cards = [];
  }

  addCard(card) {
    this.cards.push(card);
  }

  getScore() {
    let score = 0;
    let numAces = 0;

    for (const card of this.cards) {
      if (card.rank === "A") {
        numAces++;
        score += 11;
      } else {
        score += card.getValue();
      }
    }

    while (score > 21 && numAces > 0) {
      score -= 10;
      numAces--;
    }
    return score;
  }

  isBlackjack() {
    return this.cards.length === 2 && this.getScore() === 21;
  }

  isBust() {
    return this.getScore() > 21;
  }

  toString(hideFirstCard = false) {
    if (hideFirstCard && this.cards.length > 0) {
      return `[🎴 Hidden Card], ${this.cards.slice(1).map(c => c.toString()).join(", ")}`;
    }
    return this.cards.map(c => c.toString()).join(", ");
  }
}

class BlackjackGame {
  constructor(playerId, playerUsername, preferredDifficulty = null) { // Added preferredDifficulty parameter
    this.playerId = playerId;
    this.playerUsername = playerUsername;
    this.deck = new Deck();
    this.playerHand = new Hand();
    this.dealerHand = new Hand();
    this.status = "playing"; // playing, player_win, dealer_win, push

    // Set dealer strategy based on preferredDifficulty or randomly
    if (preferredDifficulty === "easy" || preferredDifficulty === "hard") {
      this.dealerStrategy = preferredDifficulty;
    } else {
      this.dealerStrategy = Math.random() < 0.5 ? "easy" : "hard"; // 50% chance for each if not specified
    }
    console.log(`[Blackjack] New game, dealer strategy: ${this.dealerStrategy}`);
  }

  start() {
    this.playerHand.addCard(this.deck.deal());
    this.dealerHand.addCard(this.deck.deal());
    this.playerHand.addCard(this.deck.deal());
    this.dealerHand.addCard(this.deck.deal());

    if (this.playerHand.isBlackjack() && this.dealerHand.isBlackjack()) {
      this.status = "push";
    } else if (this.playerHand.isBlackjack()) {
      this.status = "player_win";
    } else if (this.dealerHand.isBlackjack()) {
      this.status = "dealer_win";
    }
    return this.status;
  }

  hitPlayer() {
    this.playerHand.addCard(this.deck.deal());
    if (this.playerHand.isBust()) {
      this.status = "dealer_win";
    }
    return this.status;
  }

  standPlayer() {
    let standThreshold;
    if (this.dealerStrategy === "easy") {
      standThreshold = 17; // Dealer hits on 16 or less, stands on 17 or more
    } else { // "hard" strategy
      standThreshold = 18; // Dealer hits on 17 or less, stands on 18 or more
    }

    while (this.dealerHand.getScore() < standThreshold) {
      this.dealerHand.addCard(this.deck.deal());
    }

    if (this.dealerHand.isBust()) {
      this.status = "player_win";
    } else if (this.playerHand.getScore() > this.dealerHand.getScore()) {
      this.status = "player_win";
    } else if (this.playerHand.getScore() < this.dealerHand.getScore()) {
      this.status = "dealer_win";
    } else {
      this.status = "push";
    }
    return this.status;
  }

  getDisplay(hideDealerCard = true) {
    let result = "";
    if (this.status === "player_win") result = "🎉 Bạn thắng!";
    else if (this.status === "dealer_win") result = "😭 Dealer thắng!";
    else if (this.status === "push") result = "🤝 Hòa!";

    return `
**Dealer (${this.dealerStrategy.toUpperCase()} Mode):** ${this.dealerHand.toString(hideDealerCard)} (Score: ${hideDealerCard ? '??' : this.dealerHand.getScore()})
**${this.playerUsername}:** ${this.playerHand.toString()} (Score: ${this.playerHand.getScore()})

${result}
    `.trim();
  }
}

module.exports = { BlackjackGame };