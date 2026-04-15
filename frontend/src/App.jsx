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
  const [showRulesModal, setShowRulesModal] = useState(false);

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
  const [isReady, setIsReady] = useState(false);
  const [readyStats, setReadyStats] = useState({ ready: 0, total: 0 });
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showForceRevealModal, setShowForceRevealModal] = useState(false);
  const [playerPhoto, setPlayerPhoto] = useState(null);
  const [subError, setSubError] = useState('');
  const [lastAttempt, setLastAttempt] = useState(null); // { type: 'CREATE' } или { type: 'JOIN', roomId: '...' }
  const [messages, setMessages] = useState([]);
  const [revealNotif, setRevealNotif] = useState(null); // { playerName, label, value }
  const [isBurgerOpen, setIsBurgerOpen] = useState(false);
  
  const [speechText, setSpeechText] = useState('');
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
          const photo = window.Telegram.WebApp.initDataUnsafe.user.photo_url;
          setPlayerName(currentName);
          setPlayerId(currentId);
          setPlayerPhoto(photo);
          startParam = window.Telegram.WebApp.initDataUnsafe.start_param;
        }
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (!startParam) startParam = urlParams.get('start_param') || urlParams.get('roomId');

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
        setIsConnected(true);
        // Проверяем, нет ли у нас активной сессии в какой-то комнате
        newSocket.emit('check_session', { playerId: currentId }, (session) => {
            if (session) {
                setRoomId(session.roomId);
                setScreen(session.screen);
            } else if (startParam) {
                const photo = window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url;
                newSocket.emit('join_room', { roomId: startParam, playerId: currentId, playerName: currentName, photoUrl: photo });
                setRoomId(startParam);
                setScreen('LOBBY');
            }
        });
    });

    newSocket.on('disconnect', () => {
        setIsConnected(false);
    });

    newSocket.on('room_update', (data) => {
        if (data.players) setPlayers(data.players);
        if (data.bunkerCondition) setBunkerCondition(data.bunkerCondition);
        if (data.phase) setGamePhase(data.phase);
        if (data.round != null) setRound(data.round);
        if (data.activeSpeakerId) setActiveSpeakerId(data.activeSpeakerId);
        if (data.messages) setMessages(data.messages);
        
        // Синхронизируем состояние вскрытия карты для текущего игрока
        if (data.activeSpeakerId === currentId && data.hasRevealedInTurn !== undefined) {
            setHasRevealedThisRound(data.hasRevealedInTurn);
        }
        
        setShowSubscriptionModal(false);
        setSubError('');
    });

    newSocket.on('error', (data) => {
        if (data.type === 'SUBSCRIPTION_REQUIRED') {
            setShowSubscriptionModal(true);
            setSubError(data.isRetry ? 'Вы всё еще не подписаны на канал @SectorX7' : '');
        } else {
            alert("Ошибка: " + data.message);
        }
    });

    newSocket.on('card_revealed', (data) => {
        // Показываем компактное уведомление о вскрытии
        setRevealNotif({
            playerName: data.playerName,
            label: LABELS[data.cardKey],
            value: data.cardValue
        });
        
        // Автоматически скрываем через 4 секунды
        setTimeout(() => setRevealNotif(null), 4000);
        
        if (data.playerId === currentId) {
            setHasRevealedThisRound(true);
            setActiveCardKey(null); // Закрываем большое окно если оно было открыто
        }
    });

    newSocket.on('force_reveal_required', (data) => {
        if (data.playerId === currentId) {
            setShowForceRevealModal(true);
        }
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

    newSocket.on('ready_progress', (data) => {
        setReadyStats(data);
    });

    newSocket.on('round_started', () => {
        setShowBunkerModal(false);
        setIsReady(false);
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
    setLastAttempt({ type: 'CREATE' });
    socket.emit('create_room', { playerId, playerName, photoUrl: playerPhoto }, (response) => {
        setRoomId(response.roomId);
        setPlayers(response.players);
        setScreen('LOBBY');
        setShowSubscriptionModal(false);
        setSubError('');
    });
  };

  const handleJoinSubmit = () => {
    if (!socket || !joinCode) return;
    setLastAttempt({ type: 'JOIN', roomId: joinCode });
    socket.emit('join_room', { roomId: joinCode, playerId, playerName, photoUrl: playerPhoto });
    setRoomId(joinCode);
    setScreen('LOBBY');
    setShowJoinModal(false);
    setJoinCode(''); // Очищаем поле после входа
  };

  const handleRecheckSubscription = () => {
    if (!socket || !lastAttempt) return;
    setSubError(''); // Сбрасываем старую ошибку перед проверкой
    
    if (lastAttempt.type === 'CREATE') {
        socket.emit('create_room', { playerId, playerName, photoUrl: playerPhoto, isRetry: true }, (response) => {
            setRoomId(response.roomId);
            setPlayers(response.players);
            setScreen('LOBBY');
            setShowSubscriptionModal(false);
        });
    } else if (lastAttempt.type === 'JOIN') {
        socket.emit('join_room', { roomId: lastAttempt.roomId, playerId, playerName, photoUrl: playerPhoto, isRetry: true });
    }
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
      setSpeechText(''); // Очищаем поле
  };

  const handleLeaveRoom = () => {
    if (socket && roomId) {
        socket.emit('leave_room', { playerId });
        setRoomId(null);
        setScreen('MENU');
        setIsBurgerOpen(false);
    }
  };

  const getAvatar = (p) => {
      if (p.photoUrl) return <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />;
      return <span style={{ fontSize: '1.5rem' }}>{!p.isAlive ? '💀' : '👤'}</span>;
  };

  const handlePlayerReady = () => {
      if (!socket || !roomId || isReady) return;
      setIsReady(true);
      socket.emit('player_ready', { roomId, playerId });
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
    <div className="menu-box">
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <img 
          src="https://cdn-icons-png.flaticon.com/512/8664/8664790.png" 
          alt="Gas Mask" 
          style={{ width: "100px", opacity: 0.8, filter: "sepia(0.5) hue-rotate(60deg) brightness(0.9)" }} 
        />
      </div>
      <h2 className="screen-title">ГЛАВНОЕ МЕНЮ</h2>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Ваш ник: </span>
          <strong style={{ color: 'var(--primary)', fontWeight: '700' }}>{playerName}</strong>
          <button 
            style={{ marginLeft: '12px', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}
            onClick={() => { setTempPlayerName(playerName); setShowNameModal(true); }}
          >
            Изменить
          </button>
      </div>
      <button className="btn-primary" onClick={moveToLobby}>СОЗДАТЬ ИГРУ</button>
      <button className="btn-secondary" onClick={() => setShowJoinModal(true)}>ПРИСОЕДИНИТЬСЯ</button>
      <button className="btn-secondary" onClick={() => setShowRulesModal(true)}>ПРАВИЛА ИГРЫ</button>
    </div>
  );

  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const renderLobby = () => (
    <div className="menu-box">
      <h2 className="screen-title">ЖДЕМ ВЫЖИВШИХ</h2>
      <div className="room-code-display" onClick={copyToClipboard}>
        {roomId}
        {isCopied && <span className="copy-hint">СКОПИРОВАНО!</span>}
      </div>
      <p style={{ textAlign: 'center', marginBottom: '24px', fontSize: '0.9rem', color: 'var(--text-dim)' }}>
        Нажмите на код, чтобы скопировать. Отправьте его друзьям.
      </p>
      <ul className="player-list">
        {players.map(p => (
           <li key={p.id}>
             <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {p.photoUrl ? (
                   <img src={p.photoUrl} alt={p.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--primary)' }} />
                ) : (
                   <span style={{ fontSize: '1.2rem' }}>{p.id === players[0]?.id ? '🛡️' : '👤'}</span>
                )}
                <span style={{ fontWeight: '600' }}>{p.name} {p.id === playerId && '(Вы)'}</span>
             </span>
             {p.id === playerId && (
                 <button 
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}
                    onClick={() => { setTempPlayerName(p.name); setShowNameModal(true); }}
                 >
                    ИЗМЕНИТЬ
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
      <button className="btn-danger" onClick={() => setScreen('MENU')} style={{ border: 'none', background: 'transparent', marginTop: '10px' }}>ПОКИНУТЬ ЛОББИ</button>
    </div>
  );

  const renderGame = () => (
    <>
      <div className="status-bar">
        <span style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '1.1rem' }}>
           {gamePhase === 'VOTING' ? 'ФАЗА ИЗГНАНИЯ' : `РАУНД ${round}`}
        </span>
        {bunkerCondition && (
           <button 
             className="bunker-info-btn"
             onClick={() => setShowBunkerModal(true)}
           >
             ☢️ О БУНКЕРЕ
           </button>
        )}
        {timeLeft > 0 && <span style={{ color: 'var(--accent)', fontWeight: '600' }}>{timeLeft}s</span>}
      </div>

      <div className="game-table-container">
         <h3 style={{ fontSize: '1.2rem', fontWeight: '500', marginBottom: '20px', textAlign: 'center', color: gamePhase === 'VOTING' ? 'var(--danger)' : 'var(--text-dim)' }}>
            {gamePhase === 'VOTING' ? 'ВЫБЕРИТЕ КОГО ИЗГНАТЬ' : 'СПИСОК ВЫЖИВШИХ'}
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
                      <div className="player-avatar">{getAvatar(p)}</div>
                      <div className="player-name">{p.id === playerId ? `${p.name} (Вы)` : p.name}</div>
                      <div className="player-status">
                          {!p.isAlive ? 'ИЗГНАН' : p.id === activeSpeakerId ? 'ГОВОРИТ...' : 'ОЖИДАНИЕ'}
                      </div>
                      
                      <div className="revealed-count-badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                          Вскрыто: {p.revealedCards ? p.revealedCards.length : 0}
                      </div>
                   </div>
                 );
             })}
         </div>

         <div className="chat-container" style={{ 
              marginTop: '24px', 
              background: 'rgba(0,0,0,0.3)', 
              borderRadius: '16px', 
              border: '1px solid var(--glass-border)',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              textAlign: 'left'
          }}>
              {messages.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center', fontStyle: 'italic' }}>Лог событий пуст...</div>
              ) : (
                  messages.map((m, i) => (
                      <div key={i} style={{ fontSize: '0.9rem', lineHeight: '1.4', animation: 'fadeIn 0.3s ease-out' }}>
                          <span style={{ color: m.senderId === playerId ? 'var(--primary)' : 'var(--accent)', fontWeight: '700' }}>{m.senderName}: </span>
                          <span style={{ color: 'var(--text-main)' }}>{m.text}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: '8px' }}>{m.timestamp}</span>
                      </div>
                  ))
              )}
          </div>

         <div className="menu-box" style={{ marginTop: '24px', padding: '24px', textAlign: 'center', border: '1px solid var(--primary-glow)' }}>
             {gamePhase === 'VOTING' ? (
                 <>
                    <h4 style={{ marginBottom: '12px', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ВРЕМЯ ИЗГНАНИЯ!</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', opacity: 0.8 }}>
                       {votedFor 
                           ? `Голос отдан. Ожидаем остальных...` 
                           : (players.find(p => p.id === playerId)?.isAlive ? `Нажмите на карточку игрока выше, чтобы проголосовать.` : 'Вы изгнаны и не можете голосовать.')}
                    </p>
                 </>
             ) : activeSpeakerId === playerId ? (
                <>
                  <h4 style={{ marginBottom: '12px', color: gamePhase === 'TIE_BREAKER' ? 'var(--accent)' : 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                     {gamePhase === 'TIE_BREAKER' ? 'ВАША ЗАЩИТНАЯ РЕЧЬ' : 'ВАШ ХОД'}
                  </h4>
                  <div style={{ marginBottom: '20px' }}>
                      <textarea 
                        className="code-input" 
                        style={{ height: '70px', fontSize: '0.95rem', padding: '12px', marginBottom: '12px', textAlign: 'left' }}
                        placeholder="Что скажете в свое оправдание?"
                        value={speechText}
                        onChange={(e) => setSpeechText(e.target.value)}
                      />
                      <button className="btn-secondary" style={{ width: '100%', padding: '12px' }} onClick={handleSendSpeech} disabled={!speechText.trim()}>
                         ОТПРАВИТЬ РЕЧЬ
                      </button>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '16px' }}>
                     Нажмите на <strong style={{ color: 'var(--primary)' }}>свою карточку</strong>, чтобы вскрыть новую характеристику.
                  </p>
                  <button 
                    className="btn-primary" 
                    onClick={() => socket.emit('end_turn', { roomId, playerId })}
                    disabled={!hasRevealedThisRound && gamePhase !== 'TIE_BREAKER'}
                    style={(!hasRevealedThisRound && gamePhase !== 'TIE_BREAKER') ? { opacity: 0.4, cursor: 'not-allowed', filter: 'none' } : {}}
                  >
                    {(hasRevealedThisRound || gamePhase === 'TIE_BREAKER') ? 'ЗАВЕРШИТЬ ХОД' : 'СНАЧАЛА ВСКРОЙТЕ КАРТУ'}
                  </button>
                </>
             ) : (
                <div style={{ padding: '20px 0' }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    Слушайте выступление {players.find(p => p.id === activeSpeakerId)?.name || 'соперника'} и следите за логом чата.
                  </p>
                </div>
             )}
         </div>
      </div>
    </>
  );

  const renderGameOver = () => (
    <div className="menu-box" style={{ maxWidth: '500px', animation: 'scaleUp 0.5s ease-out', margin: '20px auto', padding: '32px 24px', textAlign: 'center' }}>
       <h1 style={{ fontSize: '2.5rem', color: 'var(--danger)', marginBottom: '8px', letterSpacing: '0.1em' }}>ИГРА ОКОНЧЕНА</h1>
       
       <p style={{ color: 'var(--text-dim)', marginBottom: '24px', fontSize: '1rem' }}>Выжившие в Бункере:</p>
       
       {gameOverData && gameOverData.survivors && gameOverData.survivors.length > 0 ? (
           <div className="players-grid" style={{ marginBottom: '32px', gridTemplateColumns: 'repeat(2, 1fr)' }}>
               {gameOverData.survivors.map(p => (
                   <div key={p.id} className="player-slot" style={{ border: '1px solid var(--primary)' }}>
                       <div className="player-avatar">
                          {p.photoUrl ? (
                              <img src={p.photoUrl} alt={p.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                              '👤'
                          )}
                          {p.isMuted && <div style={{ position: 'absolute', bottom: -5, right: -5, fontSize: '1rem' }}>🔇</div>}
                       </div>
                       <div className="player-name">{p.id === playerId ? `${p.name} (Вы)` : p.name}</div>
                   </div>
               ))}
           </div>
       ) : (
           <p style={{ color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: '32px' }}>Никто не выжил...</p>
       )}

       <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
           <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '1.1rem', textTransform: 'uppercase' }}>ВЕРДИКТ КОЛОНИИ</h3>
           <p style={{ fontSize: '1rem', color: 'var(--text-main)', lineHeight: '1.5' }}>{gameOverData?.verdict}</p>
       </div>

       {gameOverData?.survivalProbability != null && (
           <div style={{ padding: '0 8px' }}>
               <h3 style={{ color: 'var(--text-dim)', marginBottom: '16px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ВЕРОЯТНОСТЬ ВЫЖИВАНИЯ</h3>
               <div style={{ background: 'rgba(0,0,0,0.3)', width: '100%', height: '40px', borderRadius: '20px', overflow: 'hidden', position: 'relative', border: '1px solid var(--glass-border)' }}>
                   <div style={{
                       width: `${animatedScore}%`,
                       height: '100%',
                       background: animatedScore > 50 ? 'var(--primary)' : 'var(--danger)',
                       transition: 'width 2.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
                       boxShadow: '0 0 20px rgba(0,0,0,0.3) inset'
                   }} />
                   <div style={{
                       position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1.1rem', color: '#fff'
                   }}>
                       {animatedScore}%
                   </div>
               </div>
           </div>
       )}

       <button className="btn-primary" style={{ marginTop: '40px' }} onClick={() => window.location.reload()}>ИГРАТЬ ЕЩЕ РАЗ</button>
    </div>
  );

  const activeCard = (activeCardKey && cards) ? cards[activeCardKey] : null;

  return (
    <div className={`app-container ${gamePhase === 'VOTING' ? 'voting-mode' : ''}`}>
      <audio ref={audioRef} src="/bg.mp3" loop />
      <div className="floating-sound-btn" onClick={() => setVolume(v => v === 0 ? 0.2 : 0)} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, cursor: 'pointer', fontSize: '1.5rem' }}>
          {volume > 0 ? '🔊' : '🔇'}
      </div>

      <h1 className="game-title" style={{ color: 'var(--c-yellow)', zIndex: 100 }}>Sector X</h1>
      <div style={{ 
          color: isConnected ? '#2ecc71' : '#e74c3c', 
          textAlign: 'center', 
          fontWeight: 'bold',
          fontSize: '0.8rem',
          textShadow: '0 0 5px rgba(0,0,0,0.5)',
          marginBottom: '20px'
      }}>
          {isConnected ? '● СИСТЕМА ОНЛАЙН' : '○ ПОДКЛЮЧЕНИЕ ПРЕРВАНО...'}
      </div>
      
      {screen === 'MENU' && renderMenu()}
      {screen === 'LOBBY' && renderLobby()}
      {screen === 'GAME' && renderGame()}
      {screen === 'GAME_OVER_SCREEN' && renderGameOver()}

       {(screen === 'LOBBY' || screen === 'GAME') && (
           <>
              <div className="burger-btn" onClick={() => setIsBurgerOpen(!isBurgerOpen)} style={{ position: 'fixed', top: '20px', left: '20px', zIndex: 10001, cursor: 'pointer', fontSize: '1.8rem', color: 'var(--primary)' }}>
                ☰
              </div>
              
              {isBurgerOpen && (
                  <div className="modal-overlay" style={{ zIndex: 10000, background: 'rgba(0,0,0,0.8)' }} onClick={() => setIsBurgerOpen(false)}>
                      <div className="menu-box" style={{ maxWidth: '300px', padding: '40px 20px' }} onClick={e => e.stopPropagation()}>
                          <h3 style={{ marginBottom: '24px', fontSize: '1rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>НАСТРОЙКИ</h3>
                          <button className="btn-secondary" style={{ width: '100%', marginBottom: '12px' }} onClick={() => setIsBurgerOpen(false)}>ПРОДОЛЖИТЬ</button>
                          <button className="btn-danger" style={{ width: '100%' }} onClick={handleLeaveRoom}>ВЫЙТИ ИЗ ИГРЫ</button>
                      </div>
                  </div>
              )}
           </>
       )}

      {revealNotif && (
           <div className="modal-overlay" style={{ zIndex: 9000, background: 'transparent', pointerEvents: 'none' }}>
               <div className="menu-box" style={{ 
                   maxWidth: '400px', 
                   border: '2px solid var(--primary)', 
                   boxShadow: '0 0 30px var(--primary-glow)',
                   animation: 'scaleUp 0.3s ease-out',
                   pointerEvents: 'auto'
               }}>
                   <h3 style={{ color: 'var(--primary)', fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '8px' }}>КАРТА ВСКРЫТА: {revealNotif.playerName}</h3>
                   <div style={{ color: 'var(--accent)', fontWeight: '800', fontSize: '1.2rem', marginBottom: '12px' }}>{revealNotif.label}</div>
                   <div style={{ fontSize: '1rem', lineHeight: '1.5' }}>
                       {typeof revealNotif.value === 'object' ? `${revealNotif.value.gender}, ${revealNotif.value.age} лет. ${revealNotif.value.text}` : revealNotif.value}
                   </div>
                   <button className="btn-secondary" style={{ marginTop: '20px', padding: '8px' }} onClick={() => setRevealNotif(null)}>ПОНЯТНО</button>
               </div>
           </div>
       )}

      {activeCard && (
        <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setActiveCardKey(null)}>
          <div className={`card-big ${THEMES[activeCardKey]}`} onClick={e => e.stopPropagation()}>
            <div className="card-big-header">{LABELS[activeCardKey]}</div>
            
            <div className="card-big-body">
              <div className="card-big-icon">{ICONS[activeCardKey]}</div>
              <div className="card-big-value">
                {activeCardKey === 'biology' && typeof activeCard.value === 'object' ? (
                   <div>
                       <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', justifyContent: 'center' }}>
                           <span style={{ padding: '6px 16px', background: 'var(--primary)', color: 'var(--text-dark)', borderRadius: '20px', fontWeight: '700', fontSize: '0.85rem' }}>{activeCard.value.gender}</span>
                           <span style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '20px', fontWeight: '700', fontSize: '0.85rem' }}>{activeCard.value.age} лет</span>
                       </div>
                       <div style={{ fontSize: '1.1rem', lineHeight: '1.5' }}>{activeCard.value.text}</div>
                   </div>
                ) : typeof activeCard.value === 'object' ? activeCard.value.text : activeCard.value}
              </div>
            </div>

            <div className="card-big-actions">
              {activeCard.isRevealed ? (
                <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '16px' }}>ЭТА КАРТА УЖЕ ВСКРЫТА ДЛЯ ВСЕХ</p>
              ) : (
                <button 
                  className="btn-danger" 
                  onClick={() => handleRevealCard(activeCardKey)}
                  disabled={hasRevealedThisRound || playerId !== activeSpeakerId}
                  style={hasRevealedThisRound || playerId !== activeSpeakerId ? { opacity: 0.5 } : {}}
                >
                  {playerId === activeSpeakerId ? 'РАСКРЫТЬ КАРТУ 🔓' : 'ОЖИДАЙТЕ СВОЕГО ХОДА'}
                </button>
              )}
              <button className="btn-secondary" onClick={() => setActiveCardKey(null)}>ВЕРНУТЬСЯ</button>
            </div>
          </div>
        </div>
      )}

      {selectedPlayer && (
        <div className="modal-overlay" style={{ zIndex: 4000 }} onClick={() => setSelectedPlayer(null)}>
          <div className="menu-box" style={{ maxWidth: '400px', padding: '32px 24px', animation: 'scaleUp 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
             <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '4rem', marginBottom: '12px', filter: 'drop-shadow(0 0 10px var(--primary-glow))' }}>{!selectedPlayer.isAlive ? '💀' : '👥'}</div>
                <h2 style={{ fontSize: '1.8rem', color: !selectedPlayer.isAlive ? 'var(--text-dim)' : 'var(--text-main)', fontWeight: '700' }}>
                   {selectedPlayer.name} {!selectedPlayer.isAlive && '(ИЗГНАН)'}
                </h2>
             </div>
             
             {selectedPlayer.revealedCards && selectedPlayer.revealedCards.length > 0 ? (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                     {selectedPlayer.revealedCards.map(c => (
                         <div key={c.key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderLeft: '3px solid var(--primary)', borderRadius: '12px', padding: '16px' }}>
                             <div style={{ color: 'var(--primary)', fontSize: '0.75rem', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{LABELS[c.key]}</div>
                             <div style={{ color: 'var(--text-main)', fontSize: '1rem', lineHeight: '1.4' }}>{typeof c.value === 'object' ? `${c.value.gender}, ${c.value.age} лет. ${c.value.text}` : c.value}</div>
                         </div>
                     ))}
                 </div>
             ) : (
                 <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: '32px', fontSize: '0.9rem' }}>Игрок еще не раскрыл ни одной характеристики...</p>
             )}
             
             <button className="btn-primary" onClick={() => setSelectedPlayer(null)}>ПОНЯТНО</button>
          </div>
        </div>
      )}

      {isSelfDossierOpen && cards && (
        <div className="modal-overlay" style={{ zIndex: 1500 }}>
          <div className="menu-box" style={{ maxWidth: '440px', padding: '32px 24px', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
             <button className="close-modal-btn" onClick={() => setIsSelfDossierOpen(false)} style={{ position: 'absolute', top: '15px', right: '15px', fontSize: '2rem', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>×</button>
             <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h2 className="screen-title" style={{ borderBottom: 'none', marginBottom: '0' }}>ВАШЕ ДОСЬЕ</h2>
             </div>

             {actionCardToPlay ? (
                 <div style={{ background: 'rgba(212, 138, 86, 0.1)', border: '1px solid var(--accent)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                     <h3 style={{ color: 'var(--accent)', fontSize: '1.2rem', marginBottom: '12px' }}>{actionCardToPlay.title}</h3>
                     <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '20px', lineHeight: '1.4' }}>{actionCardToPlay.description}</p>
                     
                     {actionCardToPlay.targetType === 'PLAYER' && (
                          <div style={{ marginTop: '20px' }}>
                              <h4 style={{ marginBottom: '12px', fontSize: '0.85rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>ВЫБЕРИТЕ ЦЕЛЬ:</h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {players.filter(p => p.isAlive).map(p => (
                                      <button key={p.id} className="btn-secondary" style={{ padding: '12px' }} onClick={() => handlePlayActionCard(actionCardToPlay.id, p.id)}>
                                          {p.name} {p.id === playerId && '(СЕБЯ)'}
                                      </button>
                                  ))}
                              </div>
                          </div>
                     )}

                     {actionCardToPlay.targetType === 'NONE' && (
                          <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => handlePlayActionCard(actionCardToPlay.id, null)}>
                              АКТИВИРОВАТЬ
                          </button>
                     )}

                     <button className="btn-danger" style={{ marginTop: '12px', background: 'transparent', border: 'none' }} onClick={() => setActionCardToPlay(null)}>ОТМЕНА</button>
                 </div>
             ) : (
                 <>
                     {actionCards.length > 0 && (
                          <div style={{ marginBottom: '32px' }}>
                              <h3 style={{ color: 'var(--accent)', fontSize: '0.9rem', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>АКТИВНЫЕ СПЕЦКАРТЫ</h3>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  {actionCards.map(ac => (
                                      <div key={ac.id} style={{ background: 'rgba(212, 138, 86, 0.05)', border: '1px solid var(--accent-glow)', borderRadius: '12px', padding: '16px', cursor: 'pointer', transition: 'var(--transition)' }} onClick={() => setActionCardToPlay(ac)}>
                                          <div style={{ fontWeight: '700', color: 'var(--accent)', marginBottom: '4px' }}>{ac.title}</div>
                                          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '8px' }}>{ac.description}</div>
                                          <div style={{ color: 'var(--text-main)', fontSize: '0.75rem', fontWeight: '800' }}>ИСПОЛЬЗОВАТЬ →</div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                     )}

                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                        {Object.entries(cards).map(([key, card]) => (
                           <div 
                              key={key} 
                              className={`card-mini ${THEMES[key]} ${card.isRevealed ? 'revealed' : ''}`}
                              onClick={() => setActiveCardKey(key)}
                              style={{ height: '160px' }}
                           >
                              {card.isRevealed && <div className="revealed-badge">ВСКРЫТО</div>}
                              <div className="card-mini-header" style={{ fontSize: '0.7rem' }}>{LABELS[key]}</div>
                              <div className="card-mini-body" style={{ fontSize: '2rem' }}>{ICONS[key]}</div>
                              <div className="card-mini-footer" style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                                  {card.isRevealed ? 'ИЗВЕСТНО ВСЕМ' : 'СКРЫТО'}
                              </div>
                           </div>
                        ))}
                     </div>
                 </>
             )}
             <button className="btn-primary" style={{ marginTop: '32px' }} onClick={() => { setIsSelfDossierOpen(false); setActionCardToPlay(null); }}>ЗАКРЫТЬ</button>
          </div>
        </div>
      )}

      {showBunkerModal && bunkerCondition && (
        <div className="modal-overlay" style={{ zIndex: 3500 }} onClick={() => setShowBunkerModal(false)}>
           <div className="menu-box" style={{ maxWidth: '440px', padding: '32px 24px' }} onClick={e => e.stopPropagation()}>
               <div style={{ fontSize: '4rem', textAlign: 'center', marginBottom: '12px' }}>☢️</div>
               <h2 className="screen-title" style={{ fontSize: '2rem', color: 'var(--danger)', borderBottom: 'none', marginBottom: '24px' }}>СВОДКА УБЕЖИЩА</h2>
               
               <div className="bunker-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '12px' }}>
                   <h3 style={{ color: 'var(--primary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '8px' }}>КАТАСТРОФА: {bunkerCondition.catastropheTitle.toUpperCase()}</h3>
                   <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.4' }}>{bunkerCondition.catastropheDescription}</p>
               </div>
               
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                   <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                       <h3 style={{ color: 'var(--primary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '8px' }}>В БУНКЕРЕ:</h3>
                       <p style={{ color: 'var(--accent)', fontSize: '1.4rem', fontWeight: '800' }}>{bunkerCondition.timeInside} ЛЕТ</p>
                   </div>
                   <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                       <h3 style={{ color: 'var(--primary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '8px' }}>МЕСТ:</h3>
                       <p style={{ color: 'var(--danger)', fontSize: '1.4rem', fontWeight: '800' }}>{bunkerCondition.capacity}</p>
                   </div>
               </div>

               <div className="bunker-section" style={{ background: 'rgba(141, 163, 126, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid var(--primary-glow)', marginBottom: '24px' }}>
                   <h3 style={{ color: 'var(--primary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '8px' }}>ОСОБЕННОСТЬ: {bunkerCondition.perkTitle}</h3>
                   <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.4' }}>{bunkerCondition.perkDescription}</p>
               </div>

               {isReady ? (
                   <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--primary)' }}>
                        <p style={{ color: 'var(--primary)', fontWeight: 'bold' }}>ОЖИДАНИЕ ИГРОКОВ... {readyStats.ready}/{readyStats.total}</p>
                   </div>
               ) : (
                   <button 
                       className="btn-primary" 
                       onClick={handlePlayerReady}
                   >
                       Я ГОТОВ К ВЫЖИВАНИЮ
                   </button>
               )}
               
               {gamePhase !== 'BUNKER_INTRO' && (
                   <button className="btn-danger" style={{ marginTop: '12px', background: 'transparent', border: 'none' }} onClick={() => setShowBunkerModal(false)}>ЗАКРЫТЬ</button>
               )}
           </div>
        </div>
      )}

      {showRulesModal && (
        <div className="modal-overlay" style={{ zIndex: 6000 }} onClick={() => setShowRulesModal(false)}>
          <div className="menu-box" style={{ width: '90%', maxWidth: '450px', animation: 'scaleUp 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
             <h2 className="screen-title" style={{ color: 'var(--primary)' }}>КАК ВЫЖИТЬ? ☢️</h2>
             
             <div className="rules-content" style={{ textAlign: 'left', lineHeight: '1.4', fontSize: '0.9rem' }}>
                <p style={{ marginBottom: '16px' }}>
                  <strong>1. СЮЖЕТ:</strong> Наступил апокалипсис. Вы стоите у порога последнего убежища. Мест на всех не хватит! 🛡️
                </p>
                <p style={{ marginBottom: '16px' }}>
                  <strong>2. ЦЕЛЬ:</strong> Убедить остальных, что вы полезны для восстановления цивилизации. Вместимость бункера ограничена. 🏟️
                </p>
                <p style={{ marginBottom: '16px' }}>
                  <strong>3. РАУНДЫ:</strong> Каждый ход вы открываете одну свою карту (Профессия, Здоровье, Хобби и т.д.). Расскажите о себе так, чтобы вас не выкинули! 🗣️
                </p>
                <p style={{ marginBottom: '16px' }}>
                  <strong>4. ГОЛОСОВАНИЕ:</strong> После 3 раунда начинается самое интересное. Лишние игроки изгоняются из бункера навсегда... 💀
                </p>
                <p style={{ marginBottom: '16px' }}>
                  <strong>5. КАРТЫ ДЕЙСТВИЯ:</strong> У вас есть козыри в рукаве! Используйте их, чтобы спастись или помешать конкурентам 🃏.
                </p>
             </div>

             <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => setShowRulesModal(false)}>ПОНЯТНО</button>
          </div>
        </div>
      )}

      {showSubscriptionModal && (
        <div className="modal-overlay" style={{ zIndex: 7000 }}>
          <div className="menu-box" style={{ width: '90%', maxWidth: '380px', textAlign: 'center' }}>
             <div style={{ fontSize: '4rem', marginBottom: '16px' }}>📢</div>
             <h2 className="screen-title" style={{ color: 'var(--primary)' }}>ПОДПИСКА</h2>
             <p style={{ marginBottom: '24px', lineHeight: '1.5' }}>
               Для участия в игре необходимо подписаться на наш Telegram канал. Это помогает нам развивать проект!
             </p>
              <button className="btn-primary" onClick={() => {
                   window.Telegram?.WebApp?.expand();
                   window.Telegram?.WebApp?.openTelegramLink('tg://resolve?domain=SectorX7');
               }}>ПОДПИСАТЬСЯ</button>
              <button className="btn-secondary" style={{ marginTop: '10px' }} onClick={handleRecheckSubscription}>Я ПОДПИСАЛСЯ</button>
              
              {subError && (
                 <div style={{ color: 'var(--danger)', marginTop: '16px', fontSize: '0.9rem', fontWeight: '600', animation: 'scaleUp 0.2s ease-out' }}>
                    ⚠️ {subError}
                 </div>
              )}
          </div>
        </div>
      )}

      {showForceRevealModal && (
        <div className="modal-overlay" style={{ zIndex: 8000, background: 'rgba(150, 0, 0, 0.4)' }}>
          <div className="menu-box" style={{ width: '90%', maxWidth: '380px', textAlign: 'center', border: '2px solid var(--danger)' }}>
             <div style={{ fontSize: '4rem', marginBottom: '16px', animation: 'pulse 1s infinite' }}>⏲️</div>
             <h2 className="screen-title" style={{ color: 'var(--danger)' }}>ВРЕМЯ ВЫШЛО!</h2>
             <p style={{ marginBottom: '24px', fontWeight: 'bold' }}>
               Вы не успели вскрыть карту вовремя. Сделайте это прямо сейчас, чтобы продолжить игру!
             </p>
             <button className="btn-primary" onClick={() => { setShowForceRevealModal(false); setIsSelfDossierOpen(true); }}>
               ОТКРЫТЬ ДОСЬЕ
             </button>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="modal-overlay" style={{ zIndex: 5000 }} onClick={() => setShowJoinModal(false)}>
          <div className="menu-box" style={{ width: '90%', maxWidth: '360px', animation: 'scaleUp 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
             <h2 className="screen-title" style={{ fontSize: '1.8rem' }}>ВХОД В БУНКЕР</h2>
             <p style={{ textAlign: 'center', marginBottom: '24px', fontSize: '0.9rem', color: 'var(--text-dim)' }}>Введите 5-значный код комнаты.</p>
             <input 
               type="text" 
               className="code-input"
               placeholder="ABCDE"
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
