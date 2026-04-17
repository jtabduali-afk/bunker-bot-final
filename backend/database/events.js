// База данных динамических событий (Events) для "Сектор Х"

export const events = [
    {
        id: "water_leak",
        title: "ПРОРЫВ ВОДОПРОВОДА",
        description: "На нижнем уровне прорвало трубу! Драгоценная вода затапливает склады.",
        impact: { water: -15, energy: -5 },
        visual: "glitch_blue"
    },
    {
        id: "generator_fail",
        title: "СБОЙ ГЕНЕРАТОРА",
        description: "Основной реактор барахлит. Нам нужно перенаправить энергию из жилых модулей.",
        impact: { energy: -20, food: -5 },
        visual: "glitch_red"
    },
    {
        id: "mold_outbreak",
        title: "ЗАРАЖЕНИЕ ПРОДУКТОВ",
        description: "Неизвестный грибок поразил часть пищевых брикетов. Мы теряем запасы!",
        impact: { food: -20 },
        visual: "glitch_green"
    },
    {
        id: "signal_found",
        title: "СЛАБЫЙ СИГНАЛ",
        description: "Радиостанция поймала шифр на заброшенной частоте. Это воодушевляет, но требует энергии на дешифровку.",
        impact: { energy: -10, sanity: 10 }, // Sanity пока нет, но на будущее
        visual: "glitch_amber"
    },
    {
        id: "raider_scouts",
        title: "РАЗВЕДЧИКИ СНАРУЖИ",
        description: "Кто-то пытается вскрыть внешнюю шлюзовую панель. Нужно активировать турели!",
        impact: { energy: -15 },
        visual: "glitch_red"
    },
    {
        id: "good_harvest",
        title: "УДАЧНЫЙ УРОЖАЙ",
        description: "Гидропоника сработала лучше ожиданий! Сегодня в меню свежие водоросли.",
        impact: { food: 15 },
        visual: "glitch_green"
    }
];

export function getRandomEvent() {
    return events[Math.floor(Math.random() * events.length)];
}
