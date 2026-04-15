import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'

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
  const [isConnected, setIsConnected] = useState(false);
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
        setIsConnected(true);
        if (startParam) {
            newSocket.emit('join_room', { roomId: startParam, playerId: currentId, playerName: currentName });
            setRoomId(startParam);
            setScreen('LOBBY');
        }
    });

    newSocket.on('disconnect', () => {
        setIsConnected(false);
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
    <div className="menu-box text-center">
      <div className="menu-icon-wrapper">
        <img 
          src="https://cdn-icons-png.flaticon.com/512/8664/8664790.png" 
          alt="Gas Mask" 
          className="gas-mask-img"
        />
      </div>
      <h2 className="screen-title">ГЛАВНОЕ МЕНЮ</h2>
      <div className="nickname-display">
          <span>Ваш ник: </span>
          <strong className="text-highlight">{playerName}</strong>
          <button 
            className="link-btn"
            onClick={() => { setTempPlayerName(playerName); setShowNameModal(true); }}
          >
            Изменить
          </button>
      </div>
      <button className="btn-primary" onClick={moveToLobby}>СОЗДАТЬ ИГРУ</button>
      <button className="btn-secondary" onClick={() => setShowJoinModal(true)}>ПРИСОЕДИНИТЬСЯ</button>
      <button className="btn-secondary btn-muted">ПРАВИЛА ИГРЫ</button>
    </div>
  );

  const renderLobby = () => (
    <div className="menu-box">
      <h2 className="screen-title">ЖДЕМ ВЫЖИВШИХ</h2>
      <div className="room-code-display">{roomId}</div>
      <p className="description-text">Код вашей комнаты. Скиньте его друзьям!</p>
      <ul className="player-list">
        {players.map(p => (
           <li key={p.id} className={p.id === playerId ? 'current-player' : ''}>
              <span>{p.name} {p.id === playerId && '(Вы)'} {p.id === players[0]?.id && '👑'}</span>
              {p.id === playerId && (
                  <button 
                    className="icon-btn-text"
                    onClick={() => { setTempPlayerName(p.name); setShowNameModal(true); }}
                  >
                    [ред.]
                  </button>
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
        <span className="status-phase">
           {gamePhase === 'VOTING' ? 'ФАЗА ИЗГНАНИЯ' : `РАУНД: ${round}`}
        </span>
        {bunkerCondition && (
           <button 
             className="bunker-info-btn-trigger"
             onClick={() => setShowBunkerModal(true)}
           >
             ☢️ БУНКЕР
           </button>
        )}
        {timeLeft > 0 && <span className="status-timer">0:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}</span>}
      </div>

      <div className="game-table-container">
         <h3 className={`table-title ${gamePhase === 'VOTING' ? 'danger' : ''}`}>
            {gamePhase === 'VOTING' ? 'ВЫБЕРИТЕ ЖЕРТВУ' : 'ВСЕ ВЫЖИВШИЕ'}
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

          <div className="msg-box-info">
             {gamePhase === 'VOTING' ? (
                 <div className="voting-msg">
                     <h4 className="msg-title danger">ВРЕМЯ ИЗГНАНИЯ!</h4>
                     <p className="msg-text">
                        {votedFor 
                            ? `Голос отдан. Ожидаем остальных...` 
                            : (players.find(p => p.id === playerId)?.isAlive ? `Нажмите на игрока, чтобы проголосовать против него.` : 'Мертвые просто наблюдают.')}
                     </p>
                 </div>
             ) : activeSpeakerId === playerId ? (
                <div className="turn-msg">
                   <h4 className={`msg-title ${gamePhase === 'TIE_BREAKER' ? 'warning' : 'primary'}`}>
                      {gamePhase === 'TIE_BREAKER' ? 'ЗАЩИТНАЯ РЕЧЬ!' : 'ВАШ ХОД!'}
                   </h4>
                   <div className="speech-controls">
                       <textarea 
                         className="speech-textarea" 
                         placeholder="Введите ваше оправдание / ложь..."
                         value={speechText}
                         onChange={(e) => setSpeechText(e.target.value)}
                       />
                       <button className="btn-secondary" onClick={handleSendSpeech} disabled={!speechText.trim()}>
                          ОТПРАВИТЬ РЕЧЬ
                       </button>
                   </div>
                   <p className="msg-tip">
                      Нажмите на <strong className="highlight">свою аватарку</strong>, чтобы вскрыть карту!
                   </p>
                   <button 
                     className="btn-primary" 
                     onClick={() => socket.emit('end_turn', { roomId, playerId })}
                     disabled={!hasRevealedThisRound && gamePhase !== 'TIE_BREAKER'}
                   >
                     {(hasRevealedThisRound || gamePhase === 'TIE_BREAKER') ? 'ЗАВЕРШИТЬ ХОД' : 'СНАЧАЛА ВСКРОЙТЕ КАРТУ'}
                   </button>
                 </div>
             ) : (
                <div className="waiting-msg">
                  <h4 className="msg-title muted">ОЖИДАНИЕ...</h4>
                  <p className="msg-text muted">
                     {gamePhase === 'TIE_BREAKER' ? 'Слушайте защитную речь!' : 'Сейчас выступает другой игрок.'}
                  </p>
                </div>
             )}
         </div>
      </div>
    </>
  );

  const renderGameOver = () => (
    <div className="game-over-container">
       <h1 className="game-over-title">ИГРА ОКОНЧЕНА</h1>
       
       <h2 className="survivors-title">ВЫЖИВШИЕ В БУНКЕРЕ:</h2>
       {gameOverData && gameOverData.survivors && gameOverData.survivors.length > 0 ? (
           <div className="survivors-grid">
               {gameOverData.survivors.map(p => (
                   <div key={p.id} className="survivor-slot">
                       <div className="survivor-avatar">👨‍⚕️</div>
                       <div className="survivor-name">{p.id === playerId ? `${p.name} (Вы)` : p.name}</div>
                   </div>
               ))}
           </div>
       ) : (
           <p className="no-survivors">Никто не выжил...</p>
       )}

       <div className="verdict-box">
           <h3 className="verdict-title">ВЕРДИКТ КОЛОНИИ</h3>
           <p className="verdict-text">{gameOverData?.verdict}</p>
       </div>

       {gameOverData?.survivalProbability != null && (
           <div className="survival-stats">
               <h3 className="stats-title">ВЕРОЯТНОСТЬ ВЫЖИВАНИЯ</h3>
               <div className="progress-container">
                   <div 
                      className="progress-fill"
                      style={{ 
                         width: `${animatedScore}%`,
                         backgroundColor: animatedScore > 50 ? 'var(--c-sage)' : 'var(--c-rust)'
                      }} 
                   />
                   <div className="progress-label">{animatedScore}%</div>
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

      <h1 className="game-title">БУНКЕР</h1>
      <div className={`connection-status ${isConnected ? 'online' : 'offline'}`}>
          {isConnected ? '● СИСТЕМА ОНЛАЙН' : '○ ПОДКЛЮЧЕНИЕ ПРЕРВАНО...'}
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
                   <div className="bio-card-content">
                       <div className="bio-tags">
                           <span className="tag-gender">Пол: {activeCard.value.gender}</span>
                           <span className="tag-age">Возраст: {activeCard.value.age}</span>
                       </div>
                       <div className="bio-text">{activeCard.value.text}</div>
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
        <div className="modal-overlay spotlight" onClick={() => setShowBunkerModal(false)}>
           <div className="menu-box bunker-modal" onClick={e => e.stopPropagation()}>
               <div className="bunker-icon">☢️</div>
               <h2 className="screen-title danger">ВВОДНАЯ СВОДКА</h2>
               
               <div className="bunker-section">
                   <h3 className="section-title">КАТАСТРОФА: {bunkerCondition.catastropheTitle.toUpperCase()}</h3>
                   <p className="section-text">{bunkerCondition.catastropheDescription}</p>
               </div>
               
               <div className="bunker-section">
                   <h3 className="section-title">ВРЕМЯ ПРЕБЫВАНИЯ</h3>
                   <p className="section-valuehighlight">{bunkerCondition.timeInside} ЛЕТ</p>
               </div>

               <div className="bunker-section">
                   <h3 className="section-title">ОСОБЕННОСТЬ БУНКЕРА: {bunkerCondition.perkTitle}</h3>
                   <p className="section-text">{bunkerCondition.perkDescription}</p>
               </div>

               <div className="bunker-capacity-box">
                   <h3 className="capacity-title">ВМЕСТИМОСТЬ УБЕЖИЩА</h3>
                   <p className="capacity-text">
                       Живых: {players.filter(p=>p.isAlive).length} / Мест: <strong className="highlight">{bunkerCondition.capacity}</strong>
                   </p>
               </div>

               <button className="btn-primary" onClick={() => setShowBunkerModal(false)}>Я ПОНЯЛ, ВЫЖИВАЕМ</button>
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
           <div className="spotlight-overlay elimination">
              <div className="elimination-icon">💀</div>
              <h2 className="elimination-title">
                  {eliminatedPlayerInfo.eliminatedName.toUpperCase()} ИЗГНАН!
              </h2>
           </div>
        )}

      {actionAnnouncement && (
         <div className="action-announcement">
            <h1 className="announcement-title">СПЕЦУСЛОВИЕ!</h1>
            <h2 className="announcement-subtitle">{actionAnnouncement.playerName.toUpperCase()} ПРИМЕНИЛ(А) КАРТУ</h2>
            <div className="announcement-card-box">
               <span className="card-title">«{actionAnnouncement.cardTitle.toUpperCase()}»</span>
            </div>
            {actionAnnouncement.targetName && (
                <h2 className="announcement-target">НА ИГРОКА: <span className="highlight">{actionAnnouncement.targetName.toUpperCase()}</span></h2>
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
                <div className="speech-name">
                    {incomingSpeech.playerName.toUpperCase()} ГОВОРИТ:
                </div>
                <div className="speech-text">
                    «{incomingSpeech.text}»
                </div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default App;
