module.exports = {
  templates: {
    fibonacci: {
      id: "fibonacci",
      name: "Fibonacci (Planning Poker)",
      description: "Fibonacci sequence for complexity estimation",
      options: ["0", "0.5", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"],
      type: "numeric"
    },
    numeric5: {
      id: "numeric5",
      name: "Scale 1-5",
      description: "Simple numeric scale from 1 to 5",
      options: ["1", "2", "3", "4", "5"],
      type: "numeric"
    },
    numeric10: {
      id: "numeric10",
      name: "Scale 1-10",
      description: "Numeric scale from 1 to 10",
      options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      type: "numeric"
    },
    traffic: {
      id: "traffic",
      name: "Traffic Light",
      description: "Traffic light status indicator",
      options: [
        { value: "green", label: "🟢 Green" },
        { value: "yellow", label: "🟡 Yellow" },
        { value: "red", label: "🔴 Red" }
      ],
      type: "categorical"
    },
    trend: {
      id: "trend",
      name: "Trend",
      description: "Temporal trend assessment",
      options: [
        { value: "up", label: "↗️ Improving" },
        { value: "stable", label: "➡️ Stable" },
        { value: "down", label: "↘️ Worsening" }
      ],
      type: "categorical"
    },
    yesno: {
      id: "yesno",
      name: "Yes/No",
      description: "Simple binary vote",
      options: [
        { value: "yes", label: "👍 Yes" },
        { value: "no", label: "👎 No" }
      ],
      type: "categorical"
    },
    tshirt: {
      id: "tshirt",
      name: "T-Shirt Sizes",
      description: "Estimate by t-shirt sizes",
      options: ["XS", "S", "M", "L", "XL", "XXL"],
      type: "categorical"
    },
    moscow: {
      id: "moscow",
      name: "Priority (MoSCoW)",
      description: "Prioritization using MoSCoW method",
      options: [
        { value: "must", label: "Must have" },
        { value: "should", label: "Should have" },
        { value: "could", label: "Could have" },
        { value: "wont", label: "Won't have" }
      ],
      type: "categorical"
    },
    starfish: {
      id: "starfish",
      name: "Starfish",
      description: "Retrospective feedback categories",
      options: [
        { value: "start", label: "▶️ Start doing" },
        { value: "more", label: "⬆️ More of" },
        { value: "keep", label: "⭐ Keep doing" },
        { value: "less", label: "⬇️ Less of" },
        { value: "stop", label: "⛔ Stop doing" }
      ],
      type: "categorical"
    }
  },

  getTemplate(id) {
    return this.templates[id] || null;
  },

  getAllTemplates() {
    return Object.values(this.templates);
  },

  validateVote(templateId, vote) {
    const template = this.getTemplate(templateId);
    if (!template) return false;

    if (template.type === "numeric") {
      return template.options.includes(vote);
    } else if (template.type === "categorical") {
      const validValues = template.options.map(opt => 
        typeof opt === "string" ? opt : opt.value
      );
      return validValues.includes(vote);
    }

    return false;
  }
};
