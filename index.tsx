import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { 
  Building2, 
  User, 
  Phone, 
  Mail, 
  Globe, 
  ShoppingBag, 
  Stethoscope, 
  GraduationCap, 
  Palette, 
  Home, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Upload,
  Facebook,
  Instagram,
  Linkedin,
  Target,
  Sparkles,
  Users,
  Wand2,
  Loader2,
  Image as ImageIcon,
  Plus,
  ExternalLink,
  Pencil,
  Check,
  X,
  RefreshCcw,
  LayoutTemplate,
  Search,
  Link as LinkIcon,
  FileText,
  DollarSign,
  StickyNote
} from "lucide-react";

// Initialize AI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Types & Schema ---

interface AssetItem {
  id: string;
  title: string;
  type: 'product' | 'service' | 'property' | 'project' | 'course';
  imageUrl?: string;
  link?: string;
  description?: string; // Added
  price?: string; // Added
  notes?: string; // Added
  selected: boolean;
  isEditing?: boolean; // UI state
}

interface FormData {
  // Step 1: Setup
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  hasWebsite: boolean;
  websiteUrl: string;
  socialLink: string;

  // Step 2: Assets
  businessModel: string; // 'ecommerce' | 'service' | 'knowledge' | 'portfolio' | 'real_estate'
  assets: AssetItem[]; // The extracted list

  // Step 3: DNA
  persona: string;
  usp: string;
  marketingGoal: string;

  // Step 4: Visuals
  logoUrl?: string; 
  primaryColor: string;
  secondaryColor: string;
}

const INITIAL_DATA: FormData = {
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
  hasWebsite: true,
  websiteUrl: "",
  socialLink: "",
  businessModel: "service", // Default
  assets: [],
  persona: "me",
  usp: "",
  marketingGoal: "sales",
  logoUrl: "",
  primaryColor: "#6c39ca",
  secondaryColor: "#e0e7ff",
};

// Initial state for manual form in modal
const INITIAL_MANUAL_ASSET = {
  title: "",
  description: "",
  price: "",
  notes: "",
  link: ""
};

function App() {
  const [viewMode, setViewMode] = useState<'landing' | 'analyzing' | 'wizard'>('landing');
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isAddAssetModalOpen, setIsAddAssetModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'manual'>('search');
  
  // Search Tab State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{title: string, link: string}[]>([]);
  const [selectedSearchResults, setSelectedSearchResults] = useState<Set<string>>(new Set());

  // Manual Add Tab State
  const [manualAssetForm, setManualAssetForm] = useState(INITIAL_MANUAL_ASSET);

  // --- Loading Text Logic ---
  useEffect(() => {
    if (viewMode !== 'analyzing') return;

    const domainName = landingUrl.replace(/^https?:\/\//, '').split('.')[0] || "העסק שלך";
    const messages = [
      `קורא את המחשבות של ${domainName}...`,
      "סופר פיקסלים ומנתח צבעים...",
      `מכין קפה לבוטים של ${domainName}...`,
      "מאתר את המוצרים הכי שווים...",
      "בונה אסטרטגיה שתשבור את הרשת...",
      "רק עוד רגע, זה נראה מצוין..."
    ];

    let i = 0;
    setLoadingMsg(messages[0]);
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setLoadingMsg(messages[i]);
    }, 2500);

    return () => clearInterval(interval);
  }, [viewMode, landingUrl]);


  // --- AI Logic ---

  const fetchSiteHtml = async (targetUrl: string): Promise<string> => {
    try {
      const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
      if (!response.ok) throw new Error("Failed to fetch");
      const text = await response.text();
      return text.substring(0, 80000); 
    } catch (err) {
      console.warn("HTML fetch failed, proceeding with URL only logic");
      return "";
    }
  };

  const handleMagicAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    let cleanUrl = landingUrl.trim();
    if (!cleanUrl) return;
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;

    setViewMode('analyzing');
    
    try {
      const htmlContent = await fetchSiteHtml(cleanUrl);
      
      // Updated prompt to be strictly grounded in HTML to avoid hallucinations
      const prompt = `
      Analyze the website: ${cleanUrl}
      HTML Context (partial):
      \`\`\`html
      ${htmlContent}
      \`\`\`

      Task: Extract information for a marketing automation tool.
      
      CRITICAL INSTRUCTIONS:
      1. ONLY extract information clearly visible in the provided HTML. 
      2. DO NOT HALLUCINATE or invent products/services. If you don't see specific products, return an empty array for 'extracted_assets'.
      3. Identify the Business Model accurately.
      
      Return a STRICT JSON object:
      {
        "business_name": "string",
        "business_model": "one of: [ecommerce, service, knowledge, portfolio, real_estate]",
        "description_usp": "string (summary in Hebrew)",
        "marketing_goal": "one of: [sales, authority, viral]",
        "visuals": {
          "logo_url": "absolute url or null",
          "primary_color": "hex code or null",
          "secondary_color": "hex code or null"
        },
        "persona_guess": "one of: [me, us, brand]",
        "extracted_assets": [
           { "title": "string", "imageUrl": "string or null", "link": "string", "type": "product/service/etc" }
        ]
      }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const json = JSON.parse(response.text || "{}");

      // Map assets to internal structure
      const mappedAssets: AssetItem[] = (json.extracted_assets || []).map((a: any, index: number) => ({
        id: `asset-${index}`,
        title: a.title || "פריט ללא שם",
        type: a.type || 'service',
        imageUrl: a.imageUrl || "",
        link: a.link || cleanUrl,
        selected: true,
        isEditing: false
      }));

      // NOTE: Removed the "Mock" fallback. If AI returns empty, we show empty state.

      // Merge AI data into Wizard State
      setData(prev => ({
        ...prev,
        hasWebsite: true,
        websiteUrl: cleanUrl,
        businessName: json.business_name || "",
        businessModel: json.business_model || "service",
        assets: mappedAssets,
        usp: json.description_usp || "",
        marketingGoal: json.marketing_goal || "sales",
        logoUrl: json.visuals?.logo_url,
        primaryColor: json.visuals?.primary_color || "#6c39ca",
        secondaryColor: json.visuals?.secondary_color || "#e0e7ff",
        persona: json.persona_guess || "brand"
      }));

      setStep(1);
      setViewMode('wizard');

    } catch (err) {
      console.error(err);
      setError("לא הצלחנו לנתח את האתר אוטומטית. אנא מלא את הפרטים ידנית.");
      setViewMode('wizard'); 
    }
  };

  const startManual = () => {
    setData({ ...INITIAL_DATA, hasWebsite: false });
    setViewMode('wizard');
  };

  const restartProcess = () => {
     setData(INITIAL_DATA);
     setStep(1);
     setLandingUrl("");
     setViewMode('landing');
  };

  // --- Search Logic ---
  
  const performProductSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    
    try {
       // Using site: operator to restrict search strictly to the user's domain
       const site = data.websiteUrl || landingUrl;
       const prompt = `Search for "${searchQuery}" site:${site}. 
       Goal: Find specific product, service, or content pages on this specific website. 
       Return a list of page titles and URLs found on ${site}.`;
       
       const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
             tools: [{googleSearch: {}}]
          }
       });

       const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
       
       // Process chunks to unique links
       const resultsMap = new Map<string, {title: string, link: string}>();
       chunks.forEach(chunk => {
          if (chunk.web?.uri && chunk.web?.title) {
             resultsMap.set(chunk.web.uri, {
                title: chunk.web.title,
                link: chunk.web.uri
             });
          }
       });
       
       const results = Array.from(resultsMap.values());
       setSearchResults(results.length > 0 ? results : []);

    } catch (e) {
       console.error("Search failed", e);
    } finally {
       setIsSearching(false);
    }
  };

  const addSelectedSearchResults = () => {
     const newAssets: AssetItem[] = searchResults
        .filter(r => selectedSearchResults.has(r.link))
        .map((r, i) => ({
            id: `manual-search-${Date.now()}-${i}`,
            title: r.title,
            link: r.link,
            type: 'product', // Should ideally be dynamic based on business model
            selected: true,
            isEditing: false
        }));
     
     setData(prev => ({
        ...prev,
        assets: [...prev.assets, ...newAssets]
     }));
     
     closeModal();
  };

  const toggleSearchResultSelection = (link: string) => {
     const newSet = new Set(selectedSearchResults);
     if (newSet.has(link)) {
        newSet.delete(link);
     } else {
        newSet.add(link);
     }
     setSelectedSearchResults(newSet);
  };

  // --- Manual Add Logic ---
  
  const handleManualAddSubmit = () => {
     if(!manualAssetForm.title) return;

     const newAsset: AssetItem = {
        id: `manual-entry-${Date.now()}`,
        title: manualAssetForm.title,
        description: manualAssetForm.description,
        price: manualAssetForm.price,
        notes: manualAssetForm.notes,
        link: manualAssetForm.link || data.websiteUrl || '',
        type: 'product', // fallback
        selected: true,
        imageUrl: '', // could add image upload simulation here
        isEditing: false
     };

     setData(prev => ({
        ...prev,
        assets: [...prev.assets, newAsset]
     }));

     // Reset form for next entry (keeping user in flow)
     setManualAssetForm(INITIAL_MANUAL_ASSET);
     // Optional: Show a small toast or success indicator? 
     // For now just clearing allows adding another one.
  };

  const closeModal = () => {
     setIsAddAssetModalOpen(false);
     setSearchQuery("");
     setSearchResults([]);
     setSelectedSearchResults(new Set());
     setManualAssetForm(INITIAL_MANUAL_ASSET);
  };

  const openAddAssetModal = () => {
     // If no website, default to manual tab
     if (!data.hasWebsite) {
        setActiveTab('manual');
     } else {
        setActiveTab('search');
     }
     setIsAddAssetModalOpen(true);
  };

  // --- Wizard Logic ---

  const updateField = (field: keyof FormData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAssetSelection = (id: string) => {
    setData(prev => ({
       ...prev,
       assets: prev.assets.map(a => a.id === id ? { ...a, selected: !a.selected } : a)
    }));
  };

  const toggleAssetEdit = (id: string) => {
     setData(prev => ({
       ...prev,
       assets: prev.assets.map(a => a.id === id ? { ...a, isEditing: !a.isEditing } : a)
    }));
  };

  const updateAssetTitle = (id: string, newTitle: string) => {
    setData(prev => ({
       ...prev,
       assets: prev.assets.map(a => a.id === id ? { ...a, title: newTitle } : a)
    }));
  };
  
  const deleteAsset = (id: string) => {
     setData(prev => ({
        ...prev,
        assets: prev.assets.filter(a => a.id !== id)
     }));
  }

  const handleNext = () => { if (step < 5) setStep(step + 1); }; // Max step 5
  const handleBack = () => { if (step > 1) setStep(step - 1); };

  // --- Renders ---

  const renderLanding = () => (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

      <div className="max-w-2xl w-full text-center z-10 animate-fade-in space-y-8">
        
        {/* Logo Section */}
        <div className="flex justify-center mb-6">
           <img 
              src="https://kzcqheuwimzxgkrivorj.supabase.co/storage/v1/object/public/logos/4d9af8fc-9c20-4311-9546-a77acd37b6ef/logo-1758153667341.png" 
              alt="Trendz Logo" 
              className="h-20 object-contain drop-shadow-sm"
           />
        </div>
        
        <h1 className="text-4xl md:text-6xl font-black text-gray-900 tracking-tight leading-tight">
          הפוך את האתר שלך <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">למכונת שיווק אוטומטית</span>
        </h1>
        
        <p className="text-xl text-gray-500 max-w-lg mx-auto leading-relaxed">
          הכנס את כתובת האתר שלך, ו-Trendz יבנה עבורך פרופיל מותג מלא, יזהה את המוצרים שלך ויתחיל לייצר תוכן.
        </p>

        <form onSubmit={handleMagicAnalyze} className="w-full max-w-lg mx-auto relative group">
           <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
           <div className="relative flex items-center bg-white rounded-xl shadow-xl p-2 border border-gray-100">
             <Globe className="ml-3 mr-4 text-gray-400" size={24} />
             <input 
               type="text" 
               placeholder="example.co.il" 
               className="flex-1 text-lg outline-none text-gray-900 placeholder-gray-400 py-3 text-left bg-white"
               dir="ltr"
               value={landingUrl}
               onChange={(e) => setLandingUrl(e.target.value)}
             />
             <button 
               type="submit"
               className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-bold text-lg transition-all shadow-md hover:shadow-lg flex items-center gap-2"
             >
               נתח עכשיו
               <ArrowLeft size={20} />
             </button>
           </div>
           {error && <p className="text-red-500 mt-4 text-sm font-medium">{error}</p>}
        </form>

        <div className="pt-8">
           <button onClick={startManual} className="text-gray-400 hover:text-gray-600 font-medium text-sm border-b border-transparent hover:border-gray-300 transition-colors">
             אין לי עדיין אתר אינטרנט? לחץ כאן להרשמה ידנית
           </button>
        </div>
      </div>
    </div>
  );

  const renderAnalyzing = () => (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
       <div className="relative mb-8">
         <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-25"></div>
         <div className="relative bg-white p-6 rounded-full shadow-xl border border-indigo-50">
           <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
         </div>
       </div>
       <h2 className="text-2xl font-bold text-gray-900 mb-2 min-h-[40px] transition-all animate-fade-in">{loadingMsg}</h2>
       <p className="text-gray-500">הקסם קורה עכשיו...</p>
    </div>
  );

  // --- Wizard Steps ---

  const renderStep1_Setup = () => (
    <div className="space-y-6 animate-slide-up">
      {/* Magic Banner */}
      {data.hasWebsite && (
        <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex items-center justify-between mb-6">
           <div className="flex items-start gap-3">
             <Sparkles className="text-green-600 mt-1 flex-shrink-0" size={18} />
             <div>
               <h4 className="font-bold text-green-800 text-sm">המידע מולא אוטומטית!</h4>
               <p className="text-green-700 text-sm">ה-AI שלנו סרק את <span dir="ltr" className="font-mono">{data.websiteUrl}</span> ומצא את פרטי העסק.</p>
             </div>
           </div>
           
           <button 
             onClick={restartProcess}
             className="text-xs font-bold text-gray-500 hover:text-indigo-600 flex items-center gap-1 border-b border-transparent hover:border-indigo-300 transition"
           >
             <RefreshCcw size={12} />
             החלף כתובת אתר
           </button>
        </div>
      )}
      {!data.hasWebsite && (
         <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl mb-6">
            <h4 className="font-bold text-gray-800 text-sm">הרשמה ידנית</h4>
            <p className="text-gray-600 text-sm">מלא את פרטי העסק שלך באופן ידני.</p>
         </div>
      )}

      {/* Business Details First */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Building2 size={20} className="text-indigo-500"/>
            פרטי העסק
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם העסק</label>
            <div className="relative">
                <input 
                type="text" 
                className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition bg-white text-gray-900"
                value={data.businessName}
                onChange={(e) => updateField("businessName", e.target.value)}
                />
            </div>
            </div>
            {!data.hasWebsite && (
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">קישור לפרופיל רשת חברתית</label>
                    <input 
                        type="url" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900"
                        placeholder="https://instagram.com/mybusiness"
                        value={data.socialLink}
                        onChange={(e) => updateField("socialLink", e.target.value)}
                    />
                 </div>
            )}
        </div>
      </div>
      
      <div className="border-t border-gray-100 pt-6"></div>

      {/* Personal Contact Details Last */}
      <div className="space-y-4">
         <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <User size={20} className="text-indigo-500"/>
            פרטי יצירת קשר (שלך)
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
            <div className="relative">
                <input 
                type="text" 
                className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition bg-white text-gray-900"
                placeholder="ישראל ישראלי"
                value={data.contactName}
                onChange={(e) => updateField("contactName", e.target.value)}
                />
            </div>
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
            <div className="relative">
                <input 
                type="tel" 
                className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition bg-white text-gray-900"
                placeholder="050-1234567"
                value={data.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                />
            </div>
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <div className="relative">
                <input 
                type="email" 
                className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition bg-white text-gray-900"
                placeholder="you@company.com"
                value={data.email}
                onChange={(e) => updateField("email", e.target.value)}
                />
            </div>
            </div>
         </div>
      </div>

    </div>
  );

  const renderStep2_Assets = () => {
    const models = [
      { id: 'ecommerce', icon: ShoppingBag, label: 'מסחר אלקטרוני', desc: 'מוצרים פיזיים' },
      { id: 'service', icon: Stethoscope, label: 'נותן שירות', desc: 'קליניקה, מוסך, סלון יופי' },
      { id: 'knowledge', icon: GraduationCap, label: 'מומחה ידע', desc: 'קורסים, סדנאות, אימון' },
      { id: 'portfolio', icon: Palette, label: 'מבוסס פורטפוליו', desc: 'אדריכל, מעצב, צלם' },
      { id: 'real_estate', icon: Home, label: 'נדל״ן', desc: 'תיווך, נכסים להשקעה' },
    ];
    
    // Derived values for dynamic UI
    const isEcommerce = data.businessModel === 'ecommerce';
    const isRealEstate = data.businessModel === 'real_estate';
    const assetLabel = isEcommerce ? "מוצרים" : isRealEstate ? "נכסים" : "שירותים/פרויקטים";

    return (
      <div className="space-y-6 animate-slide-up">
        {/* Model Selection */}
        <div className="flex justify-between items-end mb-2">
            <label className="block text-lg font-medium text-gray-800">
                בחר את המודל העסקי שלך:
            </label>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {models.map((m) => {
            const Icon = m.icon;
            const isSelected = data.businessModel === m.id;
            return (
              <button
                key={m.id}
                onClick={() => updateField("businessModel", m.id)}
                className={`p-2 rounded-xl border transition-all flex flex-col items-center gap-1 h-full ${
                  isSelected ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-bold" : "border-gray-200 hover:border-indigo-300 bg-white text-gray-500"
                }`}
              >
                 <Icon size={16} className={isSelected ? "text-indigo-600" : "text-gray-400"} />
                 <span className="text-xs">{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* Assets List */}
        <div>
           <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                 {isEcommerce ? <ShoppingBag size={20} className="text-indigo-500"/> : <CheckCircle2 size={20} className="text-indigo-500"/>}
                 {data.hasWebsite 
                    ? `איתרנו באתר שלך את ה${assetLabel} הבאים:` 
                    : `רשימת ה${assetLabel} שלך:`
                 }
              </h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                 נבחרו {data.assets.filter(a => a.selected).length} מתוך {data.assets.length}
              </span>
           </div>

           <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {data.assets.length > 0 ? data.assets.map((asset) => (
                  <div key={asset.id} className={`flex items-start gap-4 p-3 rounded-xl border transition group ${asset.selected ? 'bg-white border-indigo-200 shadow-sm' : 'bg-gray-50 border-transparent opacity-60'}`}>
                      {/* Selection Checkbox */}
                      <button 
                        onClick={() => toggleAssetSelection(asset.id)}
                        className={`flex-shrink-0 w-6 h-6 rounded-md border flex items-center justify-center transition mt-1 ${asset.selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'}`}
                      >
                         {asset.selected && <Check size={14} />}
                      </button>

                      {/* Image (if exists) or Icon */}
                      <div className="h-12 w-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0 mt-1">
                          {asset.imageUrl ? (
                             <img src={asset.imageUrl} alt={asset.title} className="h-full w-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} />
                          ) : (
                             isEcommerce ? <ShoppingBag size={20} className="text-gray-400"/> : <Building2 size={20} className="text-gray-400"/>
                          )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                          {asset.isEditing ? (
                              <div className="flex items-center gap-2">
                                  <input 
                                    autoFocus
                                    className="w-full border border-indigo-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="שם הפריט"
                                    value={asset.title}
                                    onChange={(e) => updateAssetTitle(asset.id, e.target.value)}
                                    onBlur={() => toggleAssetEdit(asset.id)}
                                    onKeyDown={(e) => { if(e.key === 'Enter') toggleAssetEdit(asset.id) }}
                                  />
                                  <button onClick={() => toggleAssetEdit(asset.id)} className="text-green-600 hover:bg-green-50 p-1 rounded">
                                      <Check size={16} />
                                  </button>
                              </div>
                          ) : (
                              <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-gray-800 text-sm truncate cursor-pointer" onClick={() => toggleAssetEdit(asset.id)}>{asset.title}</h4>
                                  <button onClick={() => toggleAssetEdit(asset.id)} className="text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition">
                                      <Pencil size={12} />
                                  </button>
                              </div>
                          )}
                          
                          {/* Details line */}
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                              {asset.price && <span className="font-medium text-green-600">{asset.price}</span>}
                              {asset.link && (
                                <a href={asset.link} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline flex items-center gap-1 truncate max-w-[150px]">
                                    <ExternalLink size={10} /> קישור
                                </a>
                              )}
                          </div>
                      </div>
                      
                      {/* Delete Button */}
                      <button onClick={() => deleteAsset(asset.id)} className="text-gray-300 hover:text-red-500 transition self-center">
                         <X size={16} />
                      </button>
                  </div>
              )) : (
                  <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                      {data.hasWebsite ? (
                         <p className="text-gray-500">ה-AI לא מצא פריטים בטוחים להצגה.</p>
                      ) : (
                         <p className="text-gray-500">הרשימה שלך ריקה.</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">השתמש בכפתור למטה להוספת פריטים.</p>
                  </div>
              )}
              
              {/* Add New Asset Button */}
              <button 
                onClick={openAddAssetModal}
                className="w-full py-3 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl text-indigo-600 font-bold text-sm flex items-center justify-center gap-2 transition bg-indigo-50/50 hover:bg-indigo-50 mt-2"
              >
                 <Plus size={16} />
                 הוסף פריט נוסף לרשימה
              </button>
           </div>
           
           <p className="text-xs text-gray-500 mt-4 bg-yellow-50 p-2 rounded text-center">
              * סמן את הפריטים שתרצה שה-AI יתמקד בהם בייצור התוכן השבועי.
           </p>
        </div>
      </div>
    );
  };

  const renderStep3_DNA = () => (
    <div className="space-y-8 animate-slide-up">
      {/* Persona */}
      <div>
        <label className="block text-lg font-medium text-gray-800 mb-3">מי הדובר בפוסטים?</label>
        <div className="flex gap-4">
           {[{id: 'me', label: 'אני (מותג אישי)'}, {id: 'us', label: 'אנחנו (צוות)'}, {id: 'brand', label: 'המותג (ללא פנים)'}].map(opt => (
             <button
               key={opt.id}
               onClick={() => updateField("persona", opt.id)}
               className={`flex-1 py-3 px-2 rounded-xl border text-sm font-bold transition ${
                 data.persona === opt.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 hover:bg-gray-50"
               }`}
             >
               {opt.label}
             </button>
           ))}
        </div>
      </div>

      {/* USP */}
      <div>
        <label className="block text-lg font-medium text-gray-800 mb-2">ה-DNA והסיפור שלך (נוסח ע"י AI)</label>
        <p className="text-sm text-gray-500 mb-3">ערכנו עבורך טיוטה ראשונית על בסיס האתר. תרגיש חופשי לדייק אותה.</p>
        <div className="relative">
          <textarea
            rows={5}
            className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm bg-white text-gray-900"
            value={data.usp}
            onChange={(e) => updateField("usp", e.target.value)}
          />
          <div className="absolute bottom-3 left-3 bg-white border border-indigo-100 text-indigo-600 text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
            <Sparkles size={12} />
            AI Generated
          </div>
        </div>
      </div>

      {/* Goal */}
      <div>
        <label className="block text-lg font-medium text-gray-800 mb-3">מטרת השיווק העיקרית</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {id: 'sales', label: 'מכירות ישירות', icon: Target},
            {id: 'authority', label: 'בניית סמכות', icon: Users},
            {id: 'viral', label: 'חשיפה וצמיחה', icon: Globe}
          ].map(opt => (
            <button
               key={opt.id}
               onClick={() => updateField("marketingGoal", opt.id)}
               className={`p-3 rounded-lg border flex items-center gap-3 transition ${
                 data.marketingGoal === opt.id ? "border-indigo-600 bg-indigo-50 text-indigo-900" : "bg-white hover:bg-gray-50"
               }`}
             >
               <opt.icon size={18} className={data.marketingGoal === opt.id ? "text-indigo-600" : "text-gray-400"} />
               <span className="font-medium text-gray-900">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep4_Visuals = () => (
    <div className="space-y-8 animate-slide-up">
      {/* Upload Logo */}
      <div>
        <label className="block text-lg font-medium text-gray-800 mb-2">לוגו העסק</label>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm relative group">
             {data.logoUrl ? (
                <img src={data.logoUrl} className="h-full w-full object-contain p-2" alt="Logo" />
             ) : (
                <span className="text-xs text-gray-400 text-center px-1">תצוגה מקדימה</span>
             )}
             {/* Overlay for manual upload hint */}
             <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer text-white text-xs">שנה לוגו</div>
          </div>
          
          <div className="flex-1">
             {data.logoUrl ? (
                <p className="text-sm text-green-600 font-medium flex items-center gap-1 mb-2">
                    <CheckCircle2 size={16} />
                    הלוגו אותר בהצלחה מהאתר
                </p>
             ) : (
                <p className="text-sm text-gray-500 mb-2">לא מצאנו לוגו באיכות גבוהה.</p>
             )}
             <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg inline-flex items-center gap-2 transition shadow-sm text-sm">
                <Upload size={16} />
                העלאת קובץ ידנית
                <input type="file" className="hidden" />
             </label>
          </div>
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">צבע ראשי (זוהה מהאתר)</label>
          <div className="flex items-center gap-3">
            <div className="relative">
                <input 
                type="color" 
                value={data.primaryColor}
                onChange={(e) => updateField("primaryColor", e.target.value)}
                className="h-12 w-12 rounded-lg border-0 cursor-pointer p-1 bg-white shadow-sm"
                />
            </div>
            <span className="font-mono text-gray-500 uppercase">{data.primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">צבע משני</label>
          <div className="flex items-center gap-3">
            <input 
              type="color" 
              value={data.secondaryColor}
              onChange={(e) => updateField("secondaryColor", e.target.value)}
              className="h-12 w-12 rounded-lg border-0 cursor-pointer p-1 bg-white shadow-sm"
            />
            <span className="font-mono text-gray-500 uppercase">{data.secondaryColor}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep5_Connect = () => (
    <div className="space-y-6 animate-slide-up text-center pt-4">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-green-100 text-green-600 mb-4 animate-bounce">
          <CheckCircle2 size={40} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">הפרופיל מוכן!</h2>
        <p className="text-gray-600 mt-2">כל הנתונים נשמרו. חבר את הרשתות החברתיות כדי להתחיל לפרסם.</p>
      </div>

      <div className="space-y-4 max-w-md mx-auto">
        <button className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200 transition group shadow-sm">
           <div className="flex items-center gap-3">
             <div className="bg-blue-600 p-2 rounded-lg text-white"><Facebook size={20} /></div>
             <span className="font-bold text-gray-700">Facebook Page</span>
           </div>
           <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full group-hover:bg-blue-600 group-hover:text-white transition">התחבר</span>
        </button>
        
        <button className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:bg-pink-50 hover:border-pink-200 transition group shadow-sm">
           <div className="flex items-center gap-3">
             <div className="bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-2 rounded-lg text-white"><Instagram size={20} /></div>
             <span className="font-bold text-gray-700">Instagram Business</span>
           </div>
           <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full group-hover:bg-pink-500 group-hover:text-white transition">התחבר</span>
        </button>

        <button className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200 transition group shadow-sm">
           <div className="flex items-center gap-3">
             <div className="bg-blue-700 p-2 rounded-lg text-white"><Linkedin size={20} /></div>
             <span className="font-bold text-gray-700">LinkedIn Company</span>
           </div>
           <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full group-hover:bg-blue-700 group-hover:text-white transition">התחבר</span>
        </button>
      </div>
    </div>
  );

  const renderWizard = () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50/50">
      {/* Background decoration */}
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 -z-10" />
      <div className="fixed top-0 left-0 w-full h-2 bg-gray-200 z-50">
        <div 
          className="h-full bg-indigo-600 transition-all duration-500 ease-in-out" 
          style={{ width: `${(step / 5) * 100}%` }} 
        />
      </div>

      {/* Main Card */}
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[600px] relative border border-white/50 backdrop-blur-sm animate-fade-in">
        
        {/* Step Header */}
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white/80 sticky top-0 z-10 backdrop-blur-md">
           <div>
             <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase mb-1 block">שלב {step} מתוך 5</span>
             <h1 className="text-2xl font-black text-gray-900">
               {step === 1 && "בוא נכיר אותך (פרטים)"}
               {step === 2 && "מנוע הנכסים והמידע"}
               {step === 3 && "DNA ואסטרטגיה"}
               {step === 4 && "הנראות שלך"}
               {step === 5 && "יוצאים לדרך"}
             </h1>
           </div>
           <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
             {step}
           </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto relative">
          {step === 1 && renderStep1_Setup()}
          {step === 2 && renderStep2_Assets()}
          {step === 3 && renderStep3_DNA()}
          {step === 4 && renderStep4_Visuals()}
          {step === 5 && renderStep5_Connect()}
        </div>

        {/* Footer Navigation */}
        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
           <button 
             onClick={handleBack}
             disabled={step === 1}
             className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition ${
               step === 1 ? "opacity-0 pointer-events-none" : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"
             }`}
           >
             <ArrowRight size={20} />
             חזרה
           </button>

           {step < 5 ? (
             <button 
               onClick={handleNext}
               className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-transform active:scale-95"
             >
               אשר והמשך
               <ArrowLeft size={20} />
             </button>
           ) : (
             <button 
               onClick={() => alert("הרשמה הושלמה!")}
               className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-200 transition-transform active:scale-95"
             >
               סיים הרשמה
               <CheckCircle2 size={20} />
             </button>
           )}
        </div>
      </div>
      
      {/* Footer Branding */}
      <div className="mt-8 text-gray-400 text-sm font-medium flex items-center gap-2">
        <Sparkles size={14} />
        Powered by Trendz
      </div>

      {/* --- ADD ASSET MODAL --- */}
      {isAddAssetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           {/* Backdrop */}
           <div 
             className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity"
             onClick={closeModal}
           />
           
           {/* Modal Content */}
           <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
              <div className="p-0 border-b border-gray-100">
                 {/* Tabs */}
                 <div className="flex">
                    {data.hasWebsite && (
                        <button 
                           onClick={() => setActiveTab('search')}
                           className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition ${activeTab === 'search' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                           <Search size={16} />
                           חיפוש באתר
                        </button>
                    )}
                    <button 
                       onClick={() => setActiveTab('manual')}
                       className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition ${activeTab === 'manual' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                       <Pencil size={16} />
                       הוספה ידנית
                    </button>
                    
                    <button onClick={closeModal} className="absolute left-4 top-4 text-gray-400 hover:text-gray-600">
                       <X size={24} />
                    </button>
                 </div>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                 
                 {/* SEARCH TAB CONTENT */}
                 {activeTab === 'search' && data.hasWebsite && (
                   <div className="p-6">
                      <div className="flex gap-2 mb-6">
                         <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input 
                              type="text" 
                              className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition text-gray-900"
                              placeholder={`המערכת תבצע חיפוש בתוך האתר ${data.websiteUrl || 'שלך'}...`}
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && performProductSearch()}
                            />
                         </div>
                         <button 
                            onClick={performProductSearch}
                            disabled={isSearching}
                            className="bg-indigo-600 text-white px-6 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                         >
                            {isSearching ? <Loader2 className="animate-spin" /> : "חפש"}
                         </button>
                      </div>
                      
                      <div className="space-y-2">
                         {isSearching ? (
                            <div className="text-center py-12 text-gray-500">
                               <Loader2 className="animate-spin h-8 w-8 mx-auto mb-2 text-indigo-400" />
                               <p>ה-AI סורק את האתר שלך...</p>
                            </div>
                         ) : searchResults.length > 0 ? (
                            <>
                               <p className="text-sm text-gray-500 mb-2">נמצאו {searchResults.length} תוצאות:</p>
                               {searchResults.map((result) => (
                                  <div 
                                    key={result.link} 
                                    onClick={() => toggleSearchResultSelection(result.link)}
                                    className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition ${
                                       selectedSearchResults.has(result.link) 
                                       ? 'border-indigo-500 bg-indigo-50' 
                                       : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                                    }`}
                                  >
                                     <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition ${
                                        selectedSearchResults.has(result.link) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
                                     }`}>
                                        {selectedSearchResults.has(result.link) && <Check size={12} className="text-white" />}
                                     </div>
                                     <div className="min-w-0">
                                        <h4 className="font-bold text-gray-800 text-sm truncate">{result.title}</h4>
                                        <p className="text-xs text-indigo-500 truncate flex items-center gap-1">
                                           <LinkIcon size={10} />
                                           {result.link}
                                        </p>
                                     </div>
                                  </div>
                               ))}
                            </>
                         ) : (
                            <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                               <div className="inline-flex bg-white p-3 rounded-full mb-3 shadow-sm">
                                  <Search className="text-gray-400" size={24} />
                               </div>
                               <p className="text-gray-500 font-medium">אין תוצאות להצגה</p>
                            </div>
                         )}
                      </div>
                   </div>
                 )}

                 {/* MANUAL TAB CONTENT */}
                 {activeTab === 'manual' && (
                    <div className="p-6 space-y-4">
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">שם הפריט *</label>
                          <input 
                             type="text" 
                             className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900"
                             placeholder="לדוגמה: שעת ייעוץ / נעלי ספורט"
                             value={manualAssetForm.title}
                             onChange={e => setManualAssetForm(prev => ({...prev, title: e.target.value}))}
                          />
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">מחיר (אופציונלי)</label>
                             <div className="relative">
                                <DollarSign className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input 
                                   type="text" 
                                   className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900"
                                   placeholder="150 ₪"
                                   value={manualAssetForm.price}
                                   onChange={e => setManualAssetForm(prev => ({...prev, price: e.target.value}))}
                                />
                             </div>
                          </div>
                          <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">קישור (אופציונלי)</label>
                             <div className="relative">
                                <LinkIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input 
                                   type="text" 
                                   className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-left"
                                   placeholder="https://..."
                                   dir="ltr"
                                   value={manualAssetForm.link}
                                   onChange={e => setManualAssetForm(prev => ({...prev, link: e.target.value}))}
                                />
                             </div>
                          </div>
                       </div>
                       
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">תיאור הפריט</label>
                          <textarea 
                             rows={3}
                             className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900"
                             placeholder="תאר בכמה מילים את השירות או המוצר..."
                             value={manualAssetForm.description}
                             onChange={e => setManualAssetForm(prev => ({...prev, description: e.target.value}))}
                          />
                       </div>

                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">הערות ל-AI (לא יוצג ללקוח)</label>
                          <textarea 
                             rows={2}
                             className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900"
                             placeholder="מה חשוב להדגיש בפוסטים על פריט זה?"
                             value={manualAssetForm.notes}
                             onChange={e => setManualAssetForm(prev => ({...prev, notes: e.target.value}))}
                          />
                       </div>
                    </div>
                 )}

              </div>

              {/* Footer Actions */}
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end items-center gap-3">
                 <button 
                    onClick={closeModal}
                    className="text-gray-500 hover:text-gray-700 font-medium px-4"
                 >
                    ביטול
                 </button>
                 
                 {activeTab === 'search' ? (
                    <button 
                        onClick={addSelectedSearchResults}
                        disabled={selectedSearchResults.size === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition shadow-lg shadow-indigo-100"
                    >
                        הוסף {selectedSearchResults.size} פריטים
                    </button>
                 ) : (
                    <button 
                        onClick={handleManualAddSubmit}
                        disabled={!manualAssetForm.title}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition shadow-lg shadow-indigo-100"
                    >
                        הוסף והמשך
                    </button>
                 )}
              </div>
           </div>
        </div>
      )}

    </div>
  );

  // Main Logic Switch
  if (viewMode === 'landing') return renderLanding();
  if (viewMode === 'analyzing') return renderAnalyzing();
  return renderWizard();
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}