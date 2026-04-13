import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL = window.location.origin; // Используем текущий домен (Express раздает и фронт и сокеты)
const ICONS = {
  profession: "👨‍🏭",
  biology: "⚧",
  health: "🫀",
  hobby: "🎸",
  phobia: "😱",
  trait: "🎭",
  luggage: "🎒",
  fact: "⚠️"
};

const THEMES = {
  profession: "theme-profession",
  biology: "theme-biology",
  health: "theme-health",
  hobby: "theme-hobby",
  phobia: "theme-fact",
  trait: "theme-biology",
  luggage: "theme-luggage",
  fact: "theme-fact",
  action: "theme-action"
};

const LABELS = {
  profession: "ПРОФЕССИЯ",
  biology: "БИОЛОГИЯ",
  health: "ЗДОРОВЬЕ",
  hobby: "ХОББИ",
  phobia: "ФОБИЯ",
  trait: "ХАРАКТЕР",
  luggage: "БАГАЖ",
  fact: "ДОП. ФАКТ"
};

function App() {
  const [screen, setScreen] = useState('MENU');
  // Добавим защиту от бесконечных циклов
  const renderCount = useRef(0);
  const audioRef = useRef(null);
  
  useEffect(() => {
    renderCount.current++;
    if (renderCount.current > 100) {
       console.error('🛑 Обнаружена петля рендеринга! Останавливаю лишние обновления.');
    }
  });
  const [round, setRound] = useState(1);
  const [volume, setVolume] = useState(0.2);
  const [timeLeft, setTimeLeft] = useState(0); 
  const [deadline, setDeadline] = useState(null);
  const [activeCardKey, setActiveCardKey] = useState(null); 
  const [isSelfDossierOpen, setIsSelfDossierOpen] = useState(false);
  const [spotlightCard, setSpotlightCard] = useState(null);
  const [spotlightMinimized, setSpotlightMinimized] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  
  // Voting States
  const [gamePhase, setGamePhase] = useState('SPEAKING'); // SPEAKING, VOTING, TIE_BREAKER
  
  // Bunker Stats
  const [bunkerCondition, setBunkerCondition] = useState(null);
  const [showBunkerModal, setShowBunkerModal] = useState(false);
  const [hasSeenBunkerIntro, setHasSeenBunkerIntro] = useState(false);

  // Action Cards
  const [actionCards, setActionCards] = useState([]);
  const [actionCardToPlay, setActionCardToPlay] = useState(null); // stores the currently selected action card
  const [actionAnnouncement, setActionAnnouncement] = useState(null); // { playerName, cardTitle, targetName }
  const [votingAllowedTargets, setVotingAllowedTargets] = useState([]);
  const [votedFor, setVotedFor] = useState(null);
  const [eliminatedPlayerInfo, setEliminatedPlayerInfo] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);
  const [animatedScore, setAnimatedScore] = useState(0);

  // Состояние Мультиплеера
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playerName, setPlayerName] = useState('Аноним');
  const [playerId, setPlayerId] = useState(() => Math.random().toString(36).substring(7));
  const [activeSpeakerId, setActiveSpeakerId] = useState(null); 
  const [showNameModal, setShowNameModal] = useState(false);
  const [tempPlayerName, setTempPlayerName] = useState('');
  
  // Speeches
  const [speechText, setSpeechText] = useState('');
  const [incomingSpeech, setIncomingSpeech] = useState(null); // { playerName, text }
  const [cards, setCards] = useState(null);
  const [hasRevealedThisRound, setHasRevealedThisRound] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null); 

  useEffect(() => {
    let currentId = playerId;
    let currentName = playerName;
    let startParam = null;

    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();

        if (window.Telegram.WebApp.initDataUnsafe?.user) {
        currentName = window.Telegram.WebApp.initDataUnsafe.user.first_name;
        currentId = window.Telegram.WebApp.initDataUnsafe.user.id.toString();
        setPlayerName(currentName);
        setPlayerId(currentId);
        startParam = window.Telegram.WebApp.initDataUnsafe.start_param;
        }
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (!startParam) startParam = urlParams.get('start_param') || urlParams.get('roomId');

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
        if (startParam) {
            newSocket.emit('join_room', { roomId: startParam, playerId: currentId, playerName: currentName });
            setRoomId(startParam);
            setScreen('LOBBY');
        }
    });

    newSocket.on('room_update', (data) => {
        setPlayers(data.players);
        if (data.bunkerCondition) {
            setBunkerCondition(data.bunkerCondition);
        }
    });

    newSocket.on('error', (data) => {
        alert("Ошибка: " + data.message);
    });

    newSocket.on('game_started', (data) => {
        setScreen('GAME');
        if (data && data.bunkerCondition) {
            setBunkerCondition(data.bunkerCondition);
            setShowBunkerModal(true);
            setHasSeenBunkerIntro(true);
        }
    });

    newSocket.on('turn_update', (data) => {
        setGamePhase(data.isTieBreaker ? 'TIE_BREAKER' : 'SPEAKING');
        setActiveSpeakerId(data.activeSpeakerId);
        setRound(prev => {
            if (prev !== data.round) setHasRevealedThisRound(false);
            return data.round;
        });
        const currentDeadline = Date.now() + data.timeLimit * 1000;
        setDeadline(currentDeadline);
        setTimeLeft(data.timeLimit);
        setSpotlightCard(null); 
        setSpotlightMinimized(false);
    });

    newSocket.on('voting_started', (data) => {
        setGamePhase('VOTING');
        setVotingAllowedTargets(data.allowedTargets || []);
        setVotedFor(null);
        setSpotlightCard(null);
    });

    newSocket.on('player_eliminated', (data) => {
        setEliminatedPlayerInfo(data);
        setTimeout(() => setEliminatedPlayerInfo(null), 5000); // Убираем кровавый экран через 5 сек
    });

    newSocket.on('card_revealed', (data) => {
        setSpotlightCard(data);
        setSpotlightMinimized(false);
    });

    newSocket.on('your_cards', (data) => {
        if (data.cards) {
            setCards(data.cards);
            setActionCards(data.actionCards || []);
        } else {
            setCards(data);
        }
    });

    newSocket.on('action_played', (data) => {
        setActionAnnouncement(data);
        if (data.cardTitle === 'Право вето') {
            setVotedFor(null);
        }
        setTimeout(() => setActionAnnouncement(null), 5000);
    });

    newSocket.on('game_over', (data) => {
        setGamePhase('GAME_OVER');
        setGameOverData(data);
        setScreen('GAME_OVER_SCREEN');
        setSpotlightCard(null);
    });

    newSocket.on('speech_received', (data) => {
        setIncomingSpeech(data);
        // Скрываем речь через 10 секунд или когда придет новая
        setTimeout(() => {
            setIncomingSpeech(prev => prev && prev.text === data.text ? null : prev);
        }, 10000);
    });

    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    let intervalId;
    if (deadline && deadline > Date.now()) {
        intervalId = setInterval(() => {
            const remaining = Math.ceil((deadline - Date.now()) / 1000);
            if (remaining >= 0) {
                setTimeLeft(remaining);
            } else {
                setTimeLeft(0);
                clearInterval(intervalId);
            }
        }, 100);
    } else {
        setTimeLeft(0);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [deadline]);

  useEffect(() => {
      if (gamePhase === 'GAME_OVER' && gameOverData?.survivalProbability != null) {
          setTimeout(() => {
              setAnimatedScore(gameOverData.survivalProbability);
          }, 300);
      }
  }, [gamePhase, gameOverData]);

  const playBackgroundMusic = () => {
    if (audioRef.current) {
        audioRef.current.volume = volume;
        audioRef.current.play().catch(() => console.log("Автоплей заблокирован браузером"));
    }
  };

  const moveToLobby = () => {
    if (!socket) return;
    playBackgroundMusic(); 
    socket.emit('create_room', { playerId, playerName }, (response) => {
        setRoomId(response.roomId);
        setPlayers(response.players);
        setScreen('LOBBY');
    });
  };

  const handleJoinSubmit = () => {
    if (!socket || !joinCode) return;
    playBackgroundMusic();
    socket.emit('join_room', { roomId: joinCode, playerId, playerName });
    setRoomId(joinCode);
    setScreen('LOBBY');
    setShowJoinModal(false);
  };

  const handleNicknameChange = () => {
      if (!tempPlayerName.trim()) return;
      setPlayerName(tempPlayerName);
      if (socket && roomId) {
          socket.emit('change_nickname', { roomId, playerId, newName: tempPlayerName });
      }
      setShowNameModal(false);
  };

  const handleSendSpeech = () => {
      if (!speechText.trim()) return;
      socket.emit('send_speech', { roomId, playerId, text: speechText });
      setSpeechText('');
  };

  const handleRevealCard = (key) => {
    if (playerId !== activeSpeakerId || gamePhase === 'VOTING') {
      alert("В данный момент вы не можете вскрывать карту!");
      return;
    }

    if (round === 1 && key !== 'profession') {
      alert("ОШИБКА: В первом раунде можно вскрыть только ПРОФЕССИЮ!");
      return;
    }
    if (hasRevealedThisRound) {
      alert("Ты уже вскрыл карту в этом раунде!");
      return;
    }
    setCards(prev => ({ ...prev, [key]: { ...prev[key], isRevealed: true } }));
    setHasRevealedThisRound(true);
    setActiveCardKey(null);
    setIsSelfDossierOpen(false); 
    
    if (socket) {
       socket.emit('reveal_card', { roomId, playerId, cardKey: key });
    }
  };

  const handlePlayActionCard = (cardId, targetId = null) => {
      socket.emit('play_action_card', { roomId, playerId, cardId, targetId });
      setActionCardToPlay(null);
  };

  const handlePlayerClick = (p) => {
    if (!p.isAlive) {
        alert("Игрок исключен из бункера.");
        return;
    }

    if (gamePhase === 'VOTING') {
        const amIAlive = players.find(player => player.id === playerId)?.isAlive;
        if (!amIAlive) {
            alert("Мертвые не голосуют!");
            return;
        }

        if (!votingAllowedTargets.includes(p.id)) return;
        if (p.id === playerId) {
            alert("Вы не можете голосовать против себя!");
            return;
        }
        if (votedFor) {
            alert("Вы уже отдали свой голос!");
            return;
        }
        if (window.confirm(`Вы уверены, что хотите отдать голос против: ${p.name}?`)) {
            setVotedFor(p.id);
            socket.emit('cast_vote', { roomId, playerId, targetId: p.id });
        }
    } else {
        if (p.id === playerId) {
            setIsSelfDossierOpen(true);
        } else {
            setSelectedPlayer(p);
        }
    }
  };

  const renderMenu = () => (
    <div className="menu-box" style={{ textAlign: "center" }}>
      <img 
        src="https://cdn-icons-png.flaticon.com/512/8664/8664790.png" 
        alt="Gas Mask" 
        style={{ width: "120px", marginBottom: "15px", filter: "invert(0.6) sepia(1) saturate(5) hue-rotate(350deg)" }} 
      />
      <h2 className="screen-title">ГЛАВНОЕ МЕНЮ</h2>
      <div style={{ marginBottom: '15px' }}>
          <span style={{ color: 'var(--c-grey)', fontSize: '0.9rem' }}>Ваш ник: </span>
          <strong style={{ color: 'var(--c-yellow)' }}>{playerName}</strong>
          <button 
            style={{ marginLeft: '10px', background: 'none', border: 'none', color: 'var(--c-blue)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            onClick={() => { setTempPlayerName(playerName); setShowNameModal(true); }}
          >
            Изменить
          </button>
      </div>
      <button className="btn-primary" onClick={moveToLobby}>СОЗДАТЬ ИГРУ</button>
      <button className="btn-secondary" onClick={() => setShowJoinModal(true)}>ПРИСОЕДИНИТЬСЯ</button>
      <button className="btn-secondary" style={{ borderColor: 'var(--c-grey)', color: 'var(--c-grey)' }}>ПРАВИЛА ИГРЫ</button>
    </div>
  );

  const renderLobby = () => (
    <div className="menu-box">
      <h2 className="screen-title">ЖДЕМ ВЫЖИВШИХ</h2>
      <div className="room-code-display">{roomId}</div>
      <p style={{ textAlign: 'center', marginBottom: '15px' }}>Код вашей комнаты. Скиньте его друзьям!</p>
      <ul className="player-list">
        {players.map(p => (
           <li key={p.id}>
             {p.id === playerId ? (
                 <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                     <span>{p.name} (Вы) {p.id === players[0]?.id && '👑'}</span>
                     <button 
                        style={{ background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: '0.8rem', cursor: 'pointer' }}
                        onClick={() => { setTempPlayerName(p.name); setShowNameModal(true); }}
                     >
                        [ред.]
                     </button>
                 </span>
             ) : (
                 `${p.name} ${p.id === players[0]?.id ? '👑' : ''}`
             )}
           </li>
        ))}
      </ul>
      {players[0]?.id === playerId && (
         <button className="btn-primary" onClick={() => {
             if (socket) socket.emit('start_game', { roomId });
         }}>НАЧАТЬ СПУСК</button>
      )}
      <button className="btn-danger" onClick={() => setScreen('MENU')}>ПОКИНУТЬ ЛОББИ</button>
    </div>
  );

  const renderGame = () => (
    <>
      <div className="status-bar">
        <span style={{ color: 'var(--c-yellow)' }}>
           {gamePhase === 'VOTING' ? 'ФАЗА ИЗГНАНИЯ' : `РАУНД: ${round}`}
        </span>
        {bunkerCondition && (
           <button 
             className="bunker-info-btn"
             onClick={() => setShowBunkerModal(true)}
           >
             ☢️ ИНФО О БУНКЕРЕ
           </button>
        )}
        {timeLeft > 0 && <span style={{ color: 'var(--c-red)' }}>ТАЙМЕР: 0:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}</span>}
      </div>

      <div className="game-table-container">
         <h3 style={{ fontFamily: 'Teko', fontSize: '2rem', marginBottom: '20px', textAlign: 'center', textTransform: 'uppercase', color: gamePhase === 'VOTING' ? 'var(--c-red)' : 'var(--text-main)' }}>
            {gamePhase === 'VOTING' ? 'ВЫБЕРИТЕ ЖЕРТВУ' : 'Все выжившие здесь'}
         </h3>
         
         <div className="players-grid">
             {players.map(p => {
                 let classNames = `player-slot ${p.id === activeSpeakerId ? 'active-turn' : ''}`;
                 if (!p.isAlive) classNames += ' dead';
                 if (gamePhase === 'VOTING' && votingAllowedTargets.includes(p.id) && p.isAlive) classNames += ' voting-target';
                 if (votedFor === p.id) classNames += ' voted';
                 
                 return (
                   <div 
                      key={p.id} 
                      className={classNames}
                      onClick={() => handlePlayerClick(p)}
                      style={{ cursor: (!p.isAlive || (gamePhase === 'VOTING' && !votingAllowedTargets.includes(p.id))) ? 'not-allowed' : 'pointer' }}
                   >
                      <div className="player-avatar">{!p.isAlive ? '💀' : '👨‍⚕️'}</div>
                      <div className="player-name">{p.id === playerId ? `${p.name} (Вы)` : p.name}</div>
                      <div className="player-status">
                          {!p.isAlive ? 'ИЗГНАН' : p.id === activeSpeakerId ? 'ГОВОРИТ...' : 'ЖДЕТ'}
                      </div>
                      
                      <div className="revealed-count-badge">
                          Вскрыто: {p.revealedCards ? p.revealedCards.length : 0} / 8
                      </div>
                   </div>
                 );
             })}
         </div>

         <div className="menu-box" style={{ marginTop: '20px', padding: '15px', textAlign: 'center' }}>
             {gamePhase === 'VOTING' ? (
                 <>
                    <h4 style={{ marginBottom: '10px', color: 'var(--c-red)', textTransform: 'uppercase' }}>ВРЕМЯ ИЗГНАНИЯ!</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0' }}>
                       {votedFor 
                           ? `Голос отдан. Ожидаем остальных...` 
                           : (players.find(p => p.id === playerId)?.isAlive ? `Нажмите на игрока, чтобы проголосовать против него.` : 'Мертвые просто наблюдают.')}
                    </p>
                 </>
             ) : activeSpeakerId === playerId ? (
                <>
                  <h4 style={{ marginBottom: '10px', color: gamePhase === 'TIE_BREAKER' ? 'var(--c-orange)' : 'var(--c-yellow)', textTransform: 'uppercase' }}>
                     {gamePhase === 'TIE_BREAKER' ? 'ВАША ЗАЩИТНАЯ РЕЧЬ!' : 'ВАШ ХОД! Оправдайтесь или вскройте карту.'}
                  </h4>
                  <div style={{ marginBottom: '15px' }}>
                      <textarea 
                        className="code-input" 
                        style={{ height: '80px', fontSize: '1rem', padding: '10px', marginBottom: '10px' }}
                        placeholder="Введите ваше оправдание / ложь здесь..."
                        value={speechText}
                        onChange={(e) => setSpeechText(e.target.value)}
                      />
                      <button className="btn-secondary" style={{ width: '100%' }} onClick={handleSendSpeech} disabled={!speechText.trim()}>
                         ОТПРАВИТЬ РЕЧЬ ВСЕМ
                      </button>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '15px' }}>
                     Нажмите на <strong style={{ color: 'var(--c-yellow)' }}>свою аватарку</strong>, чтобы открыть свои карты и вскрыть одну из них!
                  </p>
                  <button 
                    className="btn-primary" 
                    onClick={() => socket.emit('end_turn', { roomId, playerId })}
                    disabled={!hasRevealedThisRound && gamePhase !== 'TIE_BREAKER'}
                    style={(!hasRevealedThisRound && gamePhase !== 'TIE_BREAKER') ? { opacity: 0.5, filter: 'grayscale(1)', cursor: 'not-allowed' } : {}}
                  >
                    {(hasRevealedThisRound || gamePhase === 'TIE_BREAKER') ? 'Я ВЫСКАЗАЛСЯ / ЗАВЕРШИТЬ ХОД' : 'СНАЧАЛА ВСКРОЙТЕ КАРТУ!'}
                  </button>
                </>
             ) : (
               <>
                 <h4 style={{ marginBottom: '10px', color: 'var(--c-grey)' }}>ОЖИДАНИЕ...</h4>
                 <p style={{ fontSize: '0.8rem', color: 'var(--c-grey)', marginBottom: '0' }}>
                    {gamePhase === 'TIE_BREAKER' ? 'Слушайте защитную речь кандидата на вылет!' : 'Сейчас выступает другой игрок. Таймер отмеряет его ход.'}
                 </p>
               </>
             )}
         </div>
      </div>
    </>
  );

  const renderGameOver = () => (
    <div className="menu-box" style={{ width: '95%', maxWidth: '500px', animation: 'slideUp 0.5s ease-out', margin: '20px auto', padding: '30px 20px', textAlign: 'center' }}>
       <h1 style={{ fontFamily: 'Teko', fontSize: '3.5rem', color: 'var(--c-red)', marginBottom: '10px', textShadow: '2px 2px 0px #000' }}>ИГРА ОКОНЧЕНА</h1>
       
       <h2 style={{ color: 'var(--c-yellow)', marginBottom: '15px' }}>Выжившие в Бункере:</h2>
       {gameOverData && gameOverData.survivors && gameOverData.survivors.length > 0 ? (
           <div className="players-grid" style={{ marginBottom: '20px' }}>
               {gameOverData.survivors.map(p => (
                   <div key={p.id} className="player-slot" style={{ border: '2px solid var(--c-yellow)' }}>
                       <div className="player-avatar">👨‍⚕️</div>
                       <div className="player-name">{p.id === playerId ? `${p.name} (Вы)` : p.name}</div>
                   </div>
               ))}
           </div>
       ) : (
           <p style={{ color: 'var(--c-grey)', fontStyle: 'italic' }}>Никто не выжил...</p>
       )}

       <div style={{ background: '#111', border: '2px solid var(--text-main)', borderRadius: '10px', padding: '20px', marginTop: '25px' }}>
           <h3 style={{ color: 'var(--c-yellow)', marginBottom: '10px' }}>ВЕРДИКТ КОЛОНИИ:</h3>
           <p style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>{gameOverData?.verdict}</p>
       </div>

       {gameOverData?.survivalProbability != null && (
           <div style={{ padding: '20px', marginTop: '20px', background: '#222', borderRadius: '10px' }}>
               <h3 style={{ color: 'var(--c-yellow)', marginBottom: '15px', fontSize: '1.4rem' }}>ВЕРОЯТНОСТЬ ВЫЖИВАНИЯ:</h3>
               <div style={{ background: '#111', width: '100%', height: '35px', borderRadius: '20px', overflow: 'hidden', position: 'relative', border: '2px solid #444' }}>
                   <div style={{
                       width: `${animatedScore}%`,
                       height: '100%',
                       background: animatedScore > 50 ? 'var(--c-yellow)' : 'var(--c-red)',
                       transition: 'width 2.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
                       boxShadow: '0 0 10px rgba(0,0,0,0.5) inset'
                   }} />
                   <div style={{
                       position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', textShadow: '1px 1px 2px #000', fontSize: '1.2rem', color: '#fff'
                   }}>
                       {animatedScore}%
                   </div>
               </div>
           </div>
       )}

       <button className="btn-primary" style={{ marginTop: '30px' }} onClick={() => window.location.reload()}>ИГРАТЬ ЕЩЕ РАЗ</button>
    </div>
  );

  const activeCard = (activeCardKey && cards) ? cards[activeCardKey] : null;

  return (
    <div className={`app-container ${gamePhase === 'VOTING' ? 'voting-mode' : ''}`}>
      <audio ref={audioRef} src="/bg.mp3" loop />
      <button className="floating-sound-btn" onClick={() => setVolume(volume > 0 ? 0 : 0.2)}>
         {volume > 0 ? '🔊' : '🔇'}
      </button>

      <h1 className="game-title" style={{ color: 'var(--c-yellow)', zIndex: 100 }}>БУНКЕР</h1>
      <div style={{ 
          color: socket?.connected ? '#2ecc71' : '#e74c3c', 
          textAlign: 'center', 
          fontWeight: 'bold',
          fontSize: '0.8rem',
          textShadow: '0 0 5px rgba(0,0,0,0.5)',
          marginBottom: '10px'
      }}>
          {socket?.connected ? '● СИСТЕМА ОНЛАЙН' : '○ ПОДКЛЮЧЕНИЕ ПРЕРВАНО...'}
      </div>
      
      {screen === 'MENU' && renderMenu()}
      {screen === 'LOBBY' && renderLobby()}
      {screen === 'GAME' && renderGame()}
      {screen === 'GAME_OVER_SCREEN' && renderGameOver()}

      {activeCard && (
        <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setActiveCardKey(null)}>
          <div className={`card-big ${THEMES[activeCardKey]}`} onClick={e => e.stopPropagation()}>
            <div className="card-big-header">{LABELS[activeCardKey]}</div>
            
            <div className="card-big-body">
              <div className="card-big-icon">{ICONS[activeCardKey]}</div>
              <div className="card-big-value">
                {activeCardKey === 'biology' && typeof activeCard.value === 'object' ? (
                   <div>
                       <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', justifyContent: 'center' }}>
                           <span style={{ padding: '5px 15px', background: 'var(--c-yellow)', color: '#000', borderRadius: '15px', fontWeight: 'bold' }}>Пол: {activeCard.value.gender}</span>
                           <span style={{ padding: '5px 15px', background: 'var(--c-red)', color: '#fff', borderRadius: '15px', fontWeight: 'bold' }}>Возр: {activeCard.value.age}</span>
                       </div>
                       <div>{activeCard.value.text}</div>
                   </div>
                ) : typeof activeCard.value === 'object' ? activeCard.value.text : activeCard.value}
              </div>
            </div>

            <div className="card-big-actions">
              {activeCard.isRevealed ? (
                <button className="btn-secondary" disabled>ЭТА КАРТА УЖЕ ВСКРЫТА ДЛЯ ВСЕХ</button>
              ) : (
                <button 
                  className="btn-danger" 
                  onClick={() => handleRevealCard(activeCardKey)}
                  disabled={hasRevealedThisRound || playerId !== activeSpeakerId}
                >
                  {playerId === activeSpeakerId ? 'ВСКРЫТЬ (ДЛЯ ВСЕХ)' : 'ОЖИДАЙТЕ ХОДА...'}
                </button>
              )}
              <button className="btn-primary" onClick={() => setActiveCardKey(null)}>Спрятать обратно</button>
            </div>
          </div>
        </div>
      )}

      {selectedPlayer && (
        <div className="modal-overlay" onClick={() => setSelectedPlayer(null)}>
          <div className="menu-box" style={{ width: '95%', maxWidth: '400px', animation: 'slideUp 0.2s ease-out', padding: '20px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
             <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                <div style={{ fontSize: '4rem' }}>{!selectedPlayer.isAlive ? '💀' : '👨‍⚕️'}</div>
                <h2 className="screen-title" style={{ fontSize: '2rem', borderBottom: 'none', marginBottom: '0', color: !selectedPlayer.isAlive ? 'var(--c-grey)' : 'var(--text-main)' }}>
                   {selectedPlayer.name} {!selectedPlayer.isAlive && '(Мертв)'}
                </h2>
             </div>
             
             {selectedPlayer.revealedCards && selectedPlayer.revealedCards.length > 0 ? (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                     {selectedPlayer.revealedCards.map(c => (
                         <div key={c.key} style={{ background: '#111', border: '2px solid var(--c-yellow)', borderRadius: '8px', padding: '10px' }}>
                             <div style={{ color: 'var(--c-yellow)', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px' }}>{LABELS[c.key]}</div>
                             <div style={{ color: 'var(--text-main)', fontSize: '1rem', lineHeight: '1.2' }}>{typeof c.value === 'object' ? `${c.value.gender}, ${c.value.age} лет. ${c.value.text}` : c.value}</div>
                         </div>
                     ))}
                 </div>
             ) : (
                 <p style={{ textAlign: 'center', color: 'var(--c-grey)', fontStyle: 'italic', marginBottom: '20px' }}>Игрок еще не раскрыл ни одной тайны...</p>
             )}
             
             <button className="btn-primary" onClick={() => setSelectedPlayer(null)}>ЗАКРЫТЬ ДОСЬЕ</button>
          </div>
        </div>
      )}

      {isSelfDossierOpen && cards && (
        <div className="modal-overlay" onClick={() => setIsSelfDossierOpen(false)} style={{ zIndex: 1500 }}>
          <div className="menu-box" style={{ width: '95%', maxWidth: '400px', padding: '20px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
             <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                <h2 className="screen-title" style={{ borderBottom: 'none' }}>ВАШИ КАРТЫ</h2>
             </div>

             {actionCardToPlay ? (
                 <div style={{ background: '#222', border: '1px solid var(--c-yellow)', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                     <h3 style={{ color: 'var(--c-yellow)' }}>ПРИМЕНЕНИЕ: {actionCardToPlay.title}</h3>
                     <p>{actionCardToPlay.description}</p>
                     
                     {actionCardToPlay.targetType === 'PLAYER' && (
                         <div style={{ marginTop: '15px' }}>
                             <h4 style={{ marginBottom: '10px' }}>ВЫБЕРИТЕ ЦЕЛЬ:</h4>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                 {players.filter(p => p.isAlive).map(p => (
                                     <button key={p.id} className="btn-secondary" onClick={() => handlePlayActionCard(actionCardToPlay.id, p.id)}>
                                         {p.name}
                                     </button>
                                 ))}
                             </div>
                         </div>
                     )}

                     {actionCardToPlay.targetType === 'NONE' && (
                         <button className="btn-primary" style={{ marginTop: '15px' }} onClick={() => handlePlayActionCard(actionCardToPlay.id, null)}>
                             ПРИМЕНИТЬ НА СЕБЯ / ЛОББИ
                         </button>
                     )}

                     <button className="btn-danger" style={{ marginTop: '10px' }} onClick={() => setActionCardToPlay(null)}>ОТМЕНА</button>
                 </div>
             ) : (
                 <>
                     {actionCards.length > 0 && (
                         <div style={{ marginBottom: '20px' }}>
                             <h3 style={{ color: 'var(--c-red)', marginBottom: '10px' }}>СПЕЦУСЛОВИЯ (АКТИВНЫ)</h3>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                 {actionCards.map(ac => (
                                     <div key={ac.id} style={{ background: '#331111', border: '1px solid var(--c-red)', borderRadius: '8px', padding: '10px', cursor: 'pointer' }} onClick={() => setActionCardToPlay(ac)}>
                                         <div style={{ fontWeight: 'bold', color: 'var(--c-red)' }}>{ac.title}</div>
                                         <div style={{ fontSize: '0.8rem', color: '#ccc' }}>{ac.description}</div>
                                         <div style={{ marginTop: '5px', color: 'var(--c-yellow)', fontSize: '0.8rem', fontWeight: 'bold' }}>НАЖМИТЕ, ЧТОБЫ РАЗЫГРАТЬ 🔥</div>
                                     </div>
                                 ))}
                             </div>
                         </div>
                     )}

             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                {Object.entries(cards).map(([key, card]) => (
                   <div 
                      key={key} 
                      className={`card-mini ${THEMES[key]} ${card.isRevealed ? 'revealed' : ''}`}
                      onClick={() => setActiveCardKey(key)}
                      style={{ height: '180px' }}
                   >
                      {card.isRevealed && <div className="revealed-badge">ВСКРЫТО</div>}
                      <div className="card-mini-header" style={{ fontSize: '1.2rem' }}>{LABELS[key]}</div>
                      <div className="card-mini-body" style={{ fontSize: '2.5rem' }}>{ICONS[key]}</div>
                   </div>
                ))}
             </div>
             </>
             )}
             <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => { setIsSelfDossierOpen(false); setActionCardToPlay(null); }}>ЗАКРЫТЬ ДОСЬЕ</button>
          </div>
        </div>
      )}

      {showBunkerModal && bunkerCondition && (
        <div className="modal-overlay" style={{ zIndex: 3500 }} onClick={() => setShowBunkerModal(false)}>
           <div className="menu-box bunker-modal" onClick={e => e.stopPropagation()}>
               <div style={{ fontSize: '4rem', textAlign: 'center', marginBottom: '-15px' }}>☢️</div>
               <h2 className="screen-title" style={{ fontSize: '2.5rem', color: 'var(--c-red)', borderBottom: 'none', marginBottom: '10px' }}>ВВОДНАЯ СВОДКА</h2>
               
               <div className="bunker-section">
                   <h3 style={{ color: 'var(--c-yellow)', marginBottom: '5px' }}>КАТАСТРОФА: {bunkerCondition.catastropheTitle.toUpperCase()}</h3>
                   <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '10px' }}>{bunkerCondition.catastropheDescription}</p>
               </div>
               
               <div className="bunker-section">
                   <h3 style={{ color: 'var(--c-yellow)', marginBottom: '5px' }}>ВРЕМЯ ПРЕБЫВАНИЯ:</h3>
                   <p style={{ color: 'var(--c-red)', fontSize: '1.5rem', fontWeight: 'bold' }}>{bunkerCondition.timeInside} ЛЕТ</p>
               </div>

               <div className="bunker-section">
                   <h3 style={{ color: 'var(--c-yellow)', marginBottom: '5px' }}>ОСОБЕННОСТЬ БУНКЕРА: {bunkerCondition.perkTitle}</h3>
                   <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '10px' }}>{bunkerCondition.perkDescription}</p>
               </div>

               <div className="bunker-section" style={{ border: '2px solid var(--c-red)', background: 'rgba(231, 76, 60, 0.1)', padding: '10px', borderRadius: '8px', textAlign: 'center', marginTop: '15px' }}>
                   <h3 style={{ color: 'var(--c-red)', marginBottom: '5px' }}>ВМЕСТИМОСТЬ УБЕЖИЩА</h3>
                   <p style={{ fontSize: '1.2rem', marginBottom: 0 }}>
                       Живых игроков: {players.filter(p=>p.isAlive).length} | Мест: <strong style={{ color: 'var(--c-yellow)', fontSize: '1.5rem' }}>{bunkerCondition.capacity}</strong>
                   </p>
                   <p style={{ fontSize: '0.8rem', color: 'var(--c-grey)', marginTop: '5px', marginBottom: 0 }}>Остальные должны быть изгнаны до окончания игры.</p>
               </div>

               <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => setShowBunkerModal(false)}>Я ПОНЯЛ, ВЫЖИВАЕМ</button>
           </div>
        </div>
      )}

      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="menu-box" style={{ width: '90%', maxWidth: '350px', animation: 'slideUp 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
             <h2 className="screen-title" style={{ fontSize: '2rem' }}>ВХОД В БУНКЕР</h2>
             <p style={{ textAlign: 'center', marginBottom: '15px' }}>Введите код комнаты, который вам скинул создатель.</p>
             <input 
               type="text" 
               className="code-input"
               placeholder="НАПРИМЕР: X7V9P"
               value={joinCode}
               onChange={e => setJoinCode(e.target.value.toUpperCase())}
               maxLength={6}
             />
             <button className="btn-primary" style={{ marginTop: '10px' }} onClick={handleJoinSubmit}>ВОЙТИ В БУНКЕР</button>
             <button className="btn-danger" onClick={() => setShowJoinModal(false)}>ОТМЕНА</button>
          </div>
        </div>
      )}

      {showNameModal && (
        <div className="modal-overlay" onClick={() => setShowNameModal(false)}>
          <div className="menu-box" style={{ width: '90%', maxWidth: '350px', animation: 'slideUp 0.1s ease-out' }} onClick={e => e.stopPropagation()}>
             <h2 className="screen-title" style={{ fontSize: '1.5rem' }}>ВАШЕ ИМЯ</h2>
             <input 
               type="text" 
               className="code-input"
               placeholder="Как вас называть?"
               value={tempPlayerName}
               onChange={e => setTempPlayerName(e.target.value)}
               maxLength={15}
             />
             <button className="btn-primary" style={{ marginTop: '10px' }} onClick={handleNicknameChange}>СОХРАНИТЬ</button>
             <button className="btn-danger" onClick={() => setShowNameModal(false)}>ОТМЕНА</button>
          </div>
        </div>
      )}

        {spotlightCard && (
          <div className={`spotlight-overlay ${spotlightMinimized ? 'minimized' : ''}`} onClick={() => setSpotlightMinimized(!spotlightMinimized)}>
            <div className={`card-big ${THEMES[spotlightCard.cardKey]} spotlight-card`} onClick={(e) => { e.stopPropagation(); setSpotlightMinimized(!spotlightMinimized); }}>
               <div className="card-big-header">{LABELS[spotlightCard.cardKey]}</div>
               <div className="card-big-body">
                  <div className="card-big-icon" style={{ fontSize: '6rem' }}>{ICONS[spotlightCard.cardKey]}</div>
                  <div className="card-big-value" style={{ fontSize: '1.2rem' }}>
                      {spotlightCard.cardKey === 'biology' && typeof spotlightCard.value === 'object' 
                          ? `${spotlightCard.value.gender}, ${spotlightCard.value.age} лет. ${spotlightCard.value.text}` 
                          : typeof spotlightCard.value === 'object' ? spotlightCard.value.text : spotlightCard.value}
                  </div>
               </div>
            </div>
            {!spotlightMinimized && (
              <div className="spotlight-title">
                 {spotlightCard.playerName} ОТКРЫВАЕТ КАРТУ!
              </div>
            )}
          </div>
        )}
        
        {eliminatedPlayerInfo && (
           <div className="spotlight-overlay" style={{ background: 'rgba(150, 0, 0, 0.9)' }}>
              <div style={{ fontSize: '8rem' }}>💀</div>
              <h2 style={{ fontFamily: 'Teko', fontSize: '3rem', color: '#fff', textShadow: '4px 4px 0px #000', textAlign: 'center', padding: '20px' }}>
                  {eliminatedPlayerInfo.eliminatedName.toUpperCase()} ИЗГНАН ИЗ БУНКЕРА!
              </h2>
           </div>
        )}

      {actionAnnouncement && (
         <div className="action-announcement">
            <h1 style={{ color: 'var(--c-yellow)', fontSize: '3rem', margin: 0, textShadow: '2px 2px 0 #000' }}>СПЕЦУСЛОВИЕ!</h1>
            <h2 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>{actionAnnouncement.playerName.toUpperCase()} ПРИМЕНИЛ(А) КАРТУ</h2>
            <div style={{ background: 'var(--c-red)', padding: '10px 20px', borderRadius: '8px', marginTop: '10px', display: 'inline-block' }}>
               <span style={{ fontWeight: 'bold', fontSize: '2rem', color: '#000' }}>«{actionAnnouncement.cardTitle.toUpperCase()}»</span>
            </div>
            {actionAnnouncement.targetName && (
                <h2 style={{ color: '#fff', fontSize: '1.5rem', marginTop: '10px' }}>НА ИГРОКА: <span style={{ color: 'var(--c-yellow)' }}>{actionAnnouncement.targetName.toUpperCase()}</span></h2>
            )}
         </div>
      )}

      <AnimatePresence>
        {incomingSpeech && (
            <motion.div 
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="speech-bubble-master"
            >
                <div style={{ color: 'var(--c-yellow)', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '5px' }}>
                    {incomingSpeech.playerName.toUpperCase()} ГОВОРИТ:
                </div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontStyle: 'italic' }}>
                    «{incomingSpeech.text}»
                </div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default App;
