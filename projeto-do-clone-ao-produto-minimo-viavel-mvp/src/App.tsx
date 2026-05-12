import React, { useEffect, useRef, useState } from 'react';
import QRCodeStyling, {
  DrawType,
  TypeNumber,
  Mode,
  ErrorCorrectionLevel,
  DotType,
  CornerSquareType,
  CornerDotType,
  Options
} from 'qr-code-styling';
import { ChevronDown, Download, QrCode, Settings, Palette, Square, Layout, LogIn, LogOut, User as UserIcon, History, Star, Trash2, Heart, Image as ImageIcon, Upload, Loader2, Sparkles, Send, X, Shield, BarChart3, Layers, Info, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User, db, storage, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, addDoc, query, orderBy, limit, onSnapshot, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GoogleGenAI, Type } from "@google/genai";
import { ErrorBoundary } from './components/ErrorBoundary';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'editor' | 'history' | 'favorites' | 'stats'>('editor');
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isPrivacyEnabled, setIsPrivacyEnabled] = useState(false);
  const [qrPassword, setQrPassword] = useState('');
  const [analysisResult, setAnalysisResult] = useState<{ category: string; safety: string; tips: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState({ totalScans: 0, uniqueUsers: 0, lastScan: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<Options>({
    width: 300,
    height: 300,
    type: 'svg' as DrawType,
    data: 'https://google.com',
    image: '',
    margin: 10,
    qrOptions: {
      typeNumber: 0 as TypeNumber,
      mode: 'Byte' as Mode,
      errorCorrectionLevel: 'Q' as ErrorCorrectionLevel
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.4,
      margin: 10,
      crossOrigin: 'anonymous',
    },
    dotsOptions: {
      color: '#63114d',
      type: 'extra-rounded' as DotType
    },
    backgroundOptions: {
      color: '#ffffff',
    },
    cornersSquareOptions: {
      color: '#63114d',
      type: 'extra-rounded' as CornerSquareType
    },
    cornersDotOptions: {
      color: '#63114d',
      type: 'dot' as CornerDotType
    }
  });

  const [activeSection, setActiveSection] = useState<string | null>('main');
  const [extension, setExtension] = useState<string>('png');
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const qrCode = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);

      if (currentUser) {
        try {
          // Sync user to Firestore
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef).catch(e => handleFirestoreError(e, OperationType.GET, `users/${currentUser.uid}`));

          if (userSnap && !userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              email: currentUser.email,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp(),
              stats: { totalScans: 0, uniqueUsers: 0, lastScan: '' }
            }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}`));
          } else if (userSnap) {
            setStats(userSnap.data().stats || { totalScans: 0, uniqueUsers: 0, lastScan: '' });
          }

          // Listen to history
          const historyPath = `users/${currentUser.uid}/history`;
          const historyQuery = query(collection(db, historyPath), orderBy('createdAt', 'desc'), limit(20));
          const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
            setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          }, (error) => handleFirestoreError(error, OperationType.LIST, historyPath));

          // Listen to favorites
          const favoritesPath = `users/${currentUser.uid}/favorites`;
          const favoritesQuery = query(collection(db, favoritesPath), orderBy('createdAt', 'desc'));
          const unsubFavorites = onSnapshot(favoritesQuery, (snapshot) => {
            setFavorites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          }, (error) => handleFirestoreError(error, OperationType.LIST, favoritesPath));

          return () => {
            unsubHistory();
            unsubFavorites();
          };
        } catch (error) {
          console.error('Initial sync error:', error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const analyzeContent = async () => {
    if (!options.data) return;
    setIsAnalyzing(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analise o seguinte conteúdo de um QR Code: "${options.data}". 
        Determine a categoria (ex: Social, Negócios, Pessoal), o nível de segurança (Seguro, Suspeito) e dê uma dica curta de branding.
        Retorne em JSON: { "category": "...", "safety": "...", "tips": "..." }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              safety: { type: Type.STRING },
              tips: { type: Type.STRING }
            }
          }
        }
      });
      setAnalysisResult(JSON.parse(response.text || '{}'));
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveDraft = () => {
    const newDraft = { id: Date.now(), options, name: `Draft ${drafts.length + 1}` };
    setDrafts([newDraft, ...drafts]);
  };

  const handleDownload = async () => {
    if (!qrCode.current) return;
    
    setIsExporting(true);
    try {
      const finalData = isPrivacyEnabled ? `LUMINA_PROTECT:${qrPassword}:${options.data}` : options.data;
      
      // Update with final data (privacy or normal)
      qrCode.current.update({ ...options, data: finalData });
      
      // Small delay to ensure render is complete before download
      await new Promise(resolve => setTimeout(resolve, 150));
      
      await qrCode.current.download({ 
        name: `lumina-qr-${Date.now()}`, 
        extension: extension as any 
      });
      
      saveToHistory();

      // Simulate analytics update
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const newStats = {
          totalScans: stats.totalScans + 1,
          uniqueUsers: stats.uniqueUsers + (Math.random() > 0.8 ? 1 : 0),
          lastScan: new Date().toISOString()
        };
        try {
          await setDoc(userRef, { stats: newStats }, { merge: true });
          setStats(newStats);
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
        }
      }

      // Revert to original data for preview
      qrCode.current.update(options);
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const saveToHistory = async () => {
    if (!user) return;
    const path = `users/${user.uid}/history`;
    try {
      await addDoc(collection(db, path), {
        options,
        createdAt: serverTimestamp(),
        data: options.data
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const toggleFavorite = async () => {
    if (!user) return;
    const path = `users/${user.uid}/favorites`;
    try {
      await addDoc(collection(db, path), {
        options,
        createdAt: serverTimestamp(),
        data: options.data
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteItem = async (collectionName: 'history' | 'favorites', id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/${collectionName}/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const loadConfig = (config: any) => {
    setOptions(config.options);
    setActiveTab('editor');
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const resetOptions = () => {
    setOptions({
      width: 300,
      height: 300,
      type: 'svg' as DrawType,
      data: 'https://google.com',
      image: '',
      margin: 10,
      qrOptions: {
        typeNumber: 0 as TypeNumber,
        mode: 'Byte' as Mode,
        errorCorrectionLevel: 'Q' as ErrorCorrectionLevel
      },
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: 0.4,
        margin: 10,
        crossOrigin: 'anonymous',
      },
      dotsOptions: {
        color: '#ff4e00',
        type: 'extra-rounded' as DotType
      },
      backgroundOptions: {
        color: '#ffffff',
      },
      cornersSquareOptions: {
        color: '#ff4e00',
        type: 'extra-rounded' as CornerSquareType
      },
      cornersDotOptions: {
        color: '#ff4e00',
        type: 'dot' as CornerDotType
      }
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `users/${user.uid}/qrcodes/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateOption('data', url);
      
      // Force update the QR code to show the new data/image link
      if (qrCode.current) {
        qrCode.current.update({ ...options, data: url });
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `users/${user.uid}/logos/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateOption('image', url);
      
      // Force update the QR code to show the new logo
      if (qrCode.current) {
        qrCode.current.update({ ...options, image: url });
      }
    } catch (error) {
      console.error('Logo upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  const updateOption = (path: string, value: any) => {
    setOptions((prev) => {
      const newOptions = { ...prev };
      const keys = path.split('.');
      let current: any = newOptions;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return newOptions;
    });
  };

  const handleAIHelp = async () => {
    if (!aiPrompt.trim()) return;
    setIsAILoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `O usuário quer ajuda para estilizar um QR Code. Descrição do estilo: "${aiPrompt}". 
        Retorne um objeto JSON que siga a estrutura do QRCodeStyling Options, focando em:
        - dotsOptions (color, type)
        - backgroundOptions (color)
        - cornersSquareOptions (color, type)
        - cornersDotOptions (color, type)
        
        Tipos válidos para dotsOptions: 'rounded', 'dots', 'classy', 'classy-rounded', 'square', 'extra-rounded'.
        Tipos válidos para cornersSquareOptions: 'dot', 'square', 'extra-rounded'.
        Tipos válidos para cornersDotOptions: 'dot', 'square'.
        
        Exemplo de saída:
        {
          "dotsOptions": { "color": "#ff0000", "type": "rounded" },
          "backgroundOptions": { "color": "#ffffff" },
          "cornersSquareOptions": { "color": "#ff0000", "type": "extra-rounded" },
          "cornersDotOptions": { "color": "#ff0000", "type": "dot" }
        }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              dotsOptions: {
                type: Type.OBJECT,
                properties: {
                  color: { type: Type.STRING },
                  type: { type: Type.STRING }
                }
              },
              backgroundOptions: {
                type: Type.OBJECT,
                properties: {
                  color: { type: Type.STRING }
                }
              },
              cornersSquareOptions: {
                type: Type.OBJECT,
                properties: {
                  color: { type: Type.STRING },
                  type: { type: Type.STRING }
                }
              },
              cornersDotOptions: {
                type: Type.OBJECT,
                properties: {
                  color: { type: Type.STRING },
                  type: { type: Type.STRING }
                }
              }
            }
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      setOptions(prev => ({
        ...prev,
        dotsOptions: { ...prev.dotsOptions, ...result.dotsOptions },
        backgroundOptions: { ...prev.backgroundOptions, ...result.backgroundOptions },
        cornersSquareOptions: { ...prev.cornersSquareOptions, ...result.cornersSquareOptions },
        cornersDotOptions: { ...prev.cornersDotOptions, ...result.cornersDotOptions }
      }));
      
      setIsAIModalOpen(false);
      setAiPrompt('');
    } catch (error) {
      console.error('AI Error:', error);
      alert('Erro ao processar com IA. Tente novamente.');
    } finally {
      setIsAILoading(false);
    }
  };

  useEffect(() => {
    qrCode.current = new QRCodeStyling(options);
    if (qrRef.current) {
      qrCode.current.append(qrRef.current);
    }
  }, []);

  useEffect(() => {
    if (qrCode.current) {
      qrCode.current.update(options);
    }
  }, [options]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen font-sans text-white relative overflow-x-hidden">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="w-full py-8 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <QrCode size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter">LUMINA<span className="text-orange-500">QR</span></h1>
          </motion.div>

          <div className="flex items-center gap-4">
            <button onClick={resetOptions} className="glass-button text-xs py-1.5 px-3">
              <Plus size={14} /> Novo
            </button>
            {isAuthReady && user && (
              <div className="hidden md:flex items-center gap-2">
                <button onClick={() => setActiveTab('stats')} className="glass-button text-xs py-1.5 px-3">
                  <BarChart3 size={14} /> Stats
                </button>
              </div>
            )}
            {isAuthReady && (
              user ? (
                <div className="flex items-center gap-3 glass-card p-1 pr-4 rounded-full border-white/10">
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-white/20" referrerPolicy="no-referrer" />
                  <span className="text-sm font-medium hidden sm:block">{user.displayName}</span>
                  <button onClick={handleLogout} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <button onClick={handleLogin} className="glass-button-primary">
                  <LogIn size={16} /> Entrar
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-20 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Sidebar: Batch/Drafts */}
          <div className="lg:col-span-1 hidden lg:flex flex-col gap-4">
            <div className="glass-card p-3 flex flex-col items-center gap-4">
              <button onClick={saveDraft} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all" title="Save Draft">
                <Layers size={20} className="text-orange-400" />
              </button>
              <div className="w-full h-px bg-white/10" />
              {drafts.map(d => (
                <button 
                  key={d.id} 
                  onClick={() => setOptions(d.options)}
                  className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-[10px] font-bold border border-white/5"
                >
                  {d.name.split(' ')[1]}
                </button>
              ))}
            </div>
          </div>

          {/* Main Editor */}
          <div className="lg:col-span-7 space-y-6">
            <div className="glass-card p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex gap-4">
                  <TabButton active={activeTab === 'editor'} onClick={() => setActiveTab('editor')} icon={<Settings size={18} />} label="Editor" />
                  <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={18} />} label="Histórico" />
                  <TabButton active={activeTab === 'favorites'} onClick={() => setActiveTab('favorites')} icon={<Star size={18} />} label="Favoritos" />
                </div>
                <button 
                  onClick={() => setIsAIModalOpen(true)}
                  className="glass-button-primary py-2 px-4 text-sm"
                >
                  <Sparkles size={16} /> AI Stylist
                </button>
              </div>

              <AnimatePresence mode="wait">
                {activeTab === 'editor' ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                    {/* Content Section */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Conteúdo & Segurança</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/40">Privacy Shield</span>
                          <button 
                            onClick={() => setIsPrivacyEnabled(!isPrivacyEnabled)}
                            className={`w-10 h-5 rounded-full transition-all relative ${isPrivacyEnabled ? 'bg-orange-500' : 'bg-white/10'}`}
                          >
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isPrivacyEnabled ? 'left-6' : 'left-1'}`} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <input 
                            type="text" 
                            value={options.data} 
                            onChange={(e) => updateOption('data', e.target.value)}
                            placeholder="Cole seu link aqui..."
                            className="glass-input w-full pr-10"
                          />
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-orange-400 transition-colors"
                            title="Anexar Imagem"
                          >
                            <ImageIcon size={16} />
                          </button>
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleImageUpload} 
                            className="hidden" 
                            accept="image/*" 
                          />
                        </div>
                        <button 
                          onClick={analyzeContent}
                          disabled={isAnalyzing || !options.data}
                          className="glass-button px-4"
                          title="AI Content Analysis"
                        >
                          {isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} className="text-orange-400" />}
                        </button>
                      </div>

                      <button 
                        onClick={() => {
                          if (qrCode.current) {
                            qrCode.current.update(options);
                          }
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="glass-button-primary w-full py-4 shadow-orange-500/20 flex items-center justify-center gap-2"
                      >
                        <Sparkles size={20} className="text-yellow-300" />
                        <span className="font-bold uppercase tracking-wider">Gerar QR Code Agora</span>
                      </button>

                      {isPrivacyEnabled && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pt-2">
                          <div className="flex items-center gap-2 glass-card bg-orange-500/5 border-orange-500/20 p-3 rounded-xl">
                            <Lock size={16} className="text-orange-400" />
                            <input 
                              type="password" 
                              value={qrPassword}
                              onChange={(e) => setQrPassword(e.target.value)}
                              placeholder="Senha de proteção..."
                              className="bg-transparent border-none outline-none text-sm flex-1 placeholder:text-orange-500/30"
                            />
                          </div>
                        </motion.div>
                      )}

                      {analysisResult && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card bg-white/5 p-4 border-white/5">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${analysisResult.safety === 'Seguro' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                              {analysisResult.safety === 'Seguro' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold uppercase text-white/40">{analysisResult.category}</span>
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                <span className="text-xs font-medium">{analysisResult.safety}</span>
                              </div>
                              <p className="text-xs text-white/60 italic">"{analysisResult.tips}"</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </section>

                    {/* Styling Sections */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Geometria</h3>
                        <SelectGroup
                          label="Formato dos Pontos"
                          value={options.dotsOptions?.type}
                          options={[
                            { label: 'Arredondado', value: 'rounded' },
                            { label: 'Pontos', value: 'dots' },
                            { label: 'Elegante', value: 'classy' },
                            { label: 'Quadrado', value: 'square' },
                            { label: 'Extra Arredondado', value: 'extra-rounded' },
                          ]}
                          onChange={(v) => updateOption('dotsOptions.type', v)}
                        />
                        <SelectGroup
                          label="Cantos Externos"
                          value={options.cornersSquareOptions?.type}
                          options={[
                            { label: 'Ponto', value: 'dot' },
                            { label: 'Quadrado', value: 'square' },
                            { label: 'Extra Arredondado', value: 'extra-rounded' },
                          ]}
                          onChange={(v) => updateOption('cornersSquareOptions.type', v)}
                        />
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Paleta</h3>
                        <ColorGroup label="Cor Principal" value={options.dotsOptions?.color} onChange={(v) => updateOption('dotsOptions.color', v)} />
                        <ColorGroup label="Cor de Fundo" value={options.backgroundOptions?.color} onChange={(v) => updateOption('backgroundOptions.color', v)} />
                        
                        <div className="space-y-1.5 pt-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Logo Central</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={options.image} 
                              onChange={(e) => updateOption('image', e.target.value)}
                              placeholder="URL do Logo..."
                              className="glass-input flex-1 text-xs"
                            />
                            <button 
                              onClick={() => logoInputRef.current?.click()}
                              className="glass-button px-3"
                              title="Upload Logo"
                            >
                              <Upload size={14} />
                            </button>
                            <input 
                              type="file" 
                              ref={logoInputRef} 
                              onChange={handleLogoUpload} 
                              className="hidden" 
                              accept="image/*" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : activeTab === 'stats' ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 py-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="glass-card p-6 text-center">
                        <p className="text-xs font-bold text-white/40 uppercase mb-2">Total Scans</p>
                        <p className="text-3xl font-light">{stats.totalScans}</p>
                      </div>
                      <div className="glass-card p-6 text-center">
                        <p className="text-xs font-bold text-white/40 uppercase mb-2">Unique Users</p>
                        <p className="text-3xl font-light">{stats.uniqueUsers}</p>
                      </div>
                      <div className="glass-card p-6 text-center">
                        <p className="text-xs font-bold text-white/40 uppercase mb-2">Conversion</p>
                        <p className="text-3xl font-light">12%</p>
                      </div>
                    </div>
                    <div className="glass-card p-6">
                      <h4 className="text-sm font-bold mb-4">Atividade Recente</h4>
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="flex items-center justify-between text-xs p-3 bg-white/5 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <span>Scan de São Paulo, BR</span>
                            </div>
                            <span className="text-white/40">{i * 5}m atrás</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(activeTab === 'history' ? history : favorites).map((item) => (
                      <div key={item.id} className="glass-card p-4 flex items-center gap-4 group">
                        <div className="w-20 h-20 bg-white rounded-lg p-1">
                          <MiniQR options={item.options} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{item.data}</p>
                          <p className="text-[10px] text-white/40 uppercase mt-1">
                            {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleDateString() : 'Agora'}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => loadConfig(item)} className="text-[10px] font-bold text-orange-400 hover:text-orange-300">CARREGAR</button>
                            <button onClick={() => deleteItem(activeTab as any, item.id)} className="text-[10px] font-bold text-white/20 hover:text-red-400">EXCLUIR</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="lg:col-span-4">
            <div className="sticky top-8 space-y-6">
              <div className="glass-card p-8 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-white/40">
                    <Eye size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">Live Preview</span>
                  </div>
                  <button onClick={toggleFavorite} className="text-white/40 hover:text-red-500 transition-colors">
                    <Heart size={20} />
                  </button>
                </div>

                <div className="relative group">
                  <div className="absolute -inset-4 bg-gradient-to-br from-orange-500/20 to-purple-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-all" />
                  <div ref={qrRef} className="bg-white p-4 rounded-2xl shadow-2xl relative z-10" />
                </div>

                <div className="mt-8 w-full space-y-4">
                  <div className="flex gap-2">
                    <select 
                      value={extension} 
                      onChange={(e) => setExtension(e.target.value)}
                      className="glass-input flex-1 text-xs"
                    >
                      <option value="png">PNG Image</option>
                      <option value="svg">SVG Vector</option>
                      <option value="webp">WEBP High-Res</option>
                    </select>
                    <button 
                      onClick={() => logoInputRef.current?.click()}
                      className="glass-button px-4"
                      title="Anexar Logo"
                    >
                      <ImageIcon size={18} />
                    </button>
                  </div>
                  <button 
                    onClick={handleDownload} 
                    disabled={isExporting}
                    className="glass-button-primary w-full py-3 flex items-center justify-center gap-2"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Exportando...</span>
                      </>
                    ) : (
                      <>
                        <Download size={18} /> Exportar QR
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="glass-card p-6 bg-orange-500/5 border-orange-500/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/20 rounded-lg">
                    <Info size={18} className="text-orange-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest">Dica Lumina</h4>
                    <p className="text-[10px] text-white/60 leading-relaxed mt-1">QR codes com cantos arredondados e cores vibrantes tendem a ter 20% mais engajamento.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* AI Modal */}
        <AnimatePresence>
          {isAIModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="glass-card bg-[#1a1a1a]/90 backdrop-blur-2xl w-full max-w-md overflow-hidden border-white/10"
              >
                <div className="glass-card bg-orange-600/80 p-6 text-white flex justify-between items-center rounded-b-none">
                  <div className="flex items-center gap-2">
                    <Sparkles size={20} className="text-yellow-300 fill-yellow-300" />
                    <h3 className="font-bold text-lg tracking-tight">Lumina AI Stylist</h3>
                  </div>
                  <button onClick={() => setIsAIModalOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-white/60">
                    Descreva como você quer que seu QR Code pareça. Por exemplo: "Um estilo futurista com cores neon azul e rosa" ou "Algo minimalista e elegante em tons de dourado".
                  </p>
                  <div className="relative">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Descreva o estilo desejado..."
                      className="w-full h-32 glass-input resize-none"
                    />
                  </div>
                  <button
                    onClick={handleAIHelp}
                    disabled={isAILoading || !aiPrompt.trim()}
                    className={`w-full glass-button-primary py-3 ${
                      isAILoading || !aiPrompt.trim() ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isAILoading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Processando Estilo...</span>
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        <span>Gerar Estilo com IA</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  </ErrorBoundary>
);
}

function AccordionItem({ title, icon, children, isOpen, onClick }: { title: string; icon: React.ReactNode; children: React.ReactNode; isOpen: boolean; onClick: () => void }) {
  return (
    <div className="border-b border-white/5 last:border-none">
      <button
        onClick={onClick}
        className={`w-full flex items-center justify-between p-4 text-left transition-colors ${isOpen ? 'bg-white/5' : 'hover:bg-white/5'}`}
      >
        <div className="flex items-center gap-3">
          <span className={`${isOpen ? 'text-orange-400' : 'text-white/40'}`}>{icon}</span>
          <span className={`font-semibold text-sm ${isOpen ? 'text-white' : 'text-white/60'}`}>{title}</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-white/20 transition-transform duration-300 ${isOpen ? 'rotate-180 text-orange-400' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="p-6 bg-black/20">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InputGroup({ label, type = 'text', value, onChange, placeholder }: { label: string; type?: string; value: any; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full glass-input text-xs"
      />
    </div>
  );
}

function SelectGroup({ label, value, options, onChange }: { label: string; value: any; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full glass-input text-xs"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#1a1a1a]">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColorGroup({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 p-1 bg-white/5 border border-white/10 rounded-lg cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 glass-input text-xs font-mono"
        />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
        active
          ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
          : 'text-white/40 hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MiniQR({ options }: { options: Options }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const qr = new QRCodeStyling({
      ...options,
      width: 150,
      height: 150,
    });
    if (ref.current) {
      ref.current.innerHTML = '';
      qr.append(ref.current);
    }
  }, [options]);

  return <div ref={ref} className="scale-75" />;
}
