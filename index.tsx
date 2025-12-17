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
  AlertCircle,
  Search,
  Link as LinkIcon,
  ShieldCheck,
  Zap
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
  selected: boolean;
  isEditing?: boolean;
  isVerified?: boolean; 
}

interface FormData {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  hasWebsite: boolean;
  websiteUrl: string;
  socialLink: string;
  businessModel: string;
  assets: AssetItem[];
  persona: string;
  usp: string;
  marketingGoal: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string; 
}

const INITIAL_DATA: FormData = {
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
  hasWebsite: true,
  websiteUrl: "",
  socialLink: "",
  businessModel: "service",
  assets: [],
  persona: "me",
  usp: "",
  marketingGoal: "sales",
  primaryColor: "#6c39ca",
  secondaryColor: "#e0e7ff", 
  logoUrl: "",
};

function App() {
  const [viewMode, setViewMode] = useState<'landing' | 'analyzing' | 'wizard'>('landing');
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchWithJina = async (targetUrl: string): Promise<string> => {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    
    // Robust multi-proxy strategy
    const strategies = [
        // Strategy 1: corsproxy.io (Often faster/more reliable)
        async () => {
            const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(jinaUrl)}`);
            if (!res.ok) throw new Error(`CORS Proxy failed: ${res.status}`);
            return res.text();
        },
        // Strategy 2: allorigins (Backup)
        async () => {
            const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(jinaUrl)}`);
            if (!res.ok) throw new Error(`AllOrigins failed: ${res.status}`);
            return res.text();
        }
    ];

    for (const strategy of strategies) {
        try {
            const content = await strategy();
            // Basic validation to ensure we didn't just get a proxy error page
            if (content && content.length > 50) {
                return content;
            }
        } catch (e) {
            console.warn("Proxy strategy failed, trying next...", e);
        }
    }
    
    throw new Error("Unable to retrieve site content. Please try again or enter details manually.");
  };

  const handleMagicAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    let cleanUrl = landingUrl.trim();
    if (!cleanUrl) return;
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;

    setViewMode('analyzing');
    
    try {
      setLoadingMsg("קורא את תוכן האתר...");
      
      // 1. Fetch raw markdown via Jina with robust retry logic
      const markdownContent = await fetchWithJina(cleanUrl);
      
      if (!markdownContent || markdownContent.length < 50) {
        throw new Error("לא הצלחנו לקרוא את תוכן האתר. ייתכן שהאתר חוסם גישה.");
      }

      setLoadingMsg("מפענח את המוצרים והשירותים...");

      // 2. Single AI pass to extract everything from the markdown
      const extractionPrompt = `
        You are an expert web scraper. I will provide you with the raw Markdown content of a website: ${cleanUrl}.
        
        YOUR TASK: Extract structured business data and a list of specific assets (products/services) found in the text.

        SOURCE CONTENT (Markdown):
        ${markdownContent.substring(0, 40000)} 
        // Truncated to avoid token limits, usually enough for homepage/landing

        INSTRUCTIONS:
        1. **Business Info**: Extract name, Hebrew USP (summarize what they do), colors (look for mentioned colors or hex codes, otherwise default), and find the logo URL (look for image tags with 'logo' in alt text or filename).
        2. **Assets**: Look for lists of items. In Markdown, items usually look like:
           - Images: ![Alt Text](ImageURL)
           - Links: [Link Text](URL)
           - Headings: ### Product Name
           
           Identify distinct PRODUCTS, SERVICES, COURSES, or PROJECTS. 
           - **Extract at least 3-6 items.**
           - **Link**: Must be the specific link to that item found in the markdown.
           - **Image**: Must be the specific image URL for that item found in the markdown.
           - **Title**: The name of the item.

        OUTPUT JSON SCHEMA:
        {
          "business_name": "string",
          "business_model": "ecommerce | service | knowledge | portfolio | real_estate",
          "description_usp": "Hebrew string",
          "visuals": {
            "primary_color": "HEX string",
            "secondary_color": "HEX string",
            "logo_url": "string"
          },
          "extracted_assets": [
             { 
               "title": "string", 
               "imageUrl": "string", 
               "link": "string", 
               "type": "product | service | project | course | property" 
             }
          ]
        }
      `;

      const extractionResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: extractionPrompt,
        config: { 
            responseMimeType: "application/json" 
        }
      });

      const json = JSON.parse(extractionResponse.text || "{}");

      // Helper to fix relative URLs if Jina left them (Jina usually fixes them, but just in case)
      const resolveUrl = (url?: string) => {
        if (!url) return undefined;
        let cleaned = url.trim();
        if (cleaned.startsWith('http')) return cleaned;
        if (cleaned.startsWith('//')) return `https:${cleaned}`;
        try {
          const base = cleanUrl.endsWith('/') ? cleanUrl : cleanUrl + '/';
          // Remove leading slash if both have it to avoid double slash issues
          if (base.endsWith('/') && cleaned.startsWith('/')) cleaned = cleaned.substring(1);
          return new URL(cleaned, base).href;
        } catch {
          return cleaned;
        }
      };

      const mappedAssets: AssetItem[] = (json.extracted_assets || [])
        .map((a: any, index: number) => ({
            id: `asset-${index}`,
            title: a.title || "פריט ללא שם",
            type: a.type || getAssetTypeForModel(json.business_model || "service"),
            imageUrl: resolveUrl(a.imageUrl),
            link: resolveUrl(a.link) || cleanUrl,
            selected: true,
            isEditing: false,
            isVerified: true
        }));

      // Fallback if no assets found (e.g., simple landing page)
      if (mappedAssets.length === 0) {
         mappedAssets.push({
            id: 'fallback-1',
            title: 'דף הבית',
            type: getAssetTypeForModel(json.business_model || "service"),
            link: cleanUrl,
            selected: true,
            isVerified: true
         });
      }

      setData(prev => ({
        ...prev,
        hasWebsite: true,
        websiteUrl: cleanUrl,
        businessName: json.business_name || cleanUrl.replace(/^https?:\/\//, '').split('.')[0],
        businessModel: json.business_model || "service",
        assets: mappedAssets,
        usp: json.description_usp || "",
        primaryColor: json.visuals?.primary_color || "#6c39ca",
        secondaryColor: json.visuals?.secondary_color || "#e0e7ff",
        logoUrl: resolveUrl(json.visuals?.logo_url),
        persona: "brand",
        contactName: "",
        phone: "",
        email: ""
      }));

      setStep(1);
      setViewMode('wizard');

    } catch (err) {
      console.error(err);
      setError("לא הצלחנו לקרוא את האתר באופן אוטומטי. ייתכן שהוא חסום לסריקה. אנא מלא את הפרטים ידנית.");
      setViewMode('landing'); 
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
  
  const getAssetTypeForModel = (model: string): 'product' | 'service' | 'property' | 'project' | 'course' => {
      switch(model) {
          case 'ecommerce': return 'product';
          case 'real_estate': return 'property';
          case 'portfolio': return 'project';
          case 'knowledge': return 'course';
          default: return 'service';
      }
  };

  const addNewAsset = () => {
    const newId = `manual-${Date.now()}`;
    const type = getAssetTypeForModel(data.businessModel);
    setData(prev => ({
      ...prev,
      assets: [...prev.assets, {
        id: newId,
        title: "",
        type: type, 
        link: prev.websiteUrl,
        selected: true,
        isEditing: true,
        isVerified: false
      }]
    }));
  };

  const handleNext = () => { if (step < 5) setStep(step + 1); };
  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const renderLanding = () => (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

      <div className="max-w-2xl w-full text-center z-10 animate-fade-in space-y-8">
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
          הכנס את כתובת האתר שלך, וה-AI שלנו יקרא אותו (Reader Mode) כדי לדייק ב-100% בפרטים.
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
           {error && (
             <div className="bg-red-50 border border-red-100 p-3 rounded-lg mt-4 flex items-center gap-2 text-red-600 text-sm font-medium">
               <AlertCircle size={16} />
               {error}
             </div>
           )}
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
           {loadingMsg.includes("Jina") ? (
             <Zap className="h-12 w-12 text-indigo-600 animate-pulse" />
           ) : (
             <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
           )}
         </div>
       </div>
       <h2 className="text-2xl font-bold text-gray-900 mb-2 max-w-md mx-auto min-h-[60px] transition-all animate-fade-in">{loadingMsg}</h2>
       <p className="text-gray-500 mt-8">ה-AI מנתח את האתר ובונה את הפרופיל העסקי שלך.</p>
    </div>
  );

  const renderStep1_Setup = () => (
    <div className="space-y-6 animate-slide-up">
      {data.hasWebsite && (
        <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex items-center justify-between mb-6">
           <div className="flex items-start gap-3">
             <Sparkles className="text-green-600 mt-1 flex-shrink-0" size={18} />
             <div>
               <h4 className="font-bold text-green-800 text-sm">המידע התקבל בהצלחה!</h4>
               <p className="text-green-700 text-sm">מציג את הנתונים מתוך <span dir="ltr" className="font-mono">{data.websiteUrl}</span></p>
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

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Building2 size={20} className="text-indigo-500"/>
            פרטי העסק
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם העסק</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white text-gray-900"
              value={data.businessName}
              onChange={(e) => updateField("businessName", e.target.value)}
            />
            </div>
        </div>
      </div>
      
      <div className="border-t border-gray-100 pt-6"></div>

      <div className="space-y-4">
         <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <User size={20} className="text-indigo-500"/>
            פרטי יצירת קשר (שלך)
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white text-gray-900"
              placeholder="ישראל ישראלי"
              value={data.contactName}
              onChange={(e) => updateField("contactName", e.target.value)}
            />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
            <input 
              type="tel" 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white text-gray-900"
              placeholder="050-1234567"
              value={data.phone}
              onChange={(e) => updateField("phone", e.target.value)}
            />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <input 
              type="email" 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white text-gray-900"
              placeholder="you@company.com"
              value={data.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
            </div>
         </div>
      </div>
    </div>
  );

  const renderStep2_Assets = () => {
    const models = [
      { id: 'ecommerce', icon: ShoppingBag, label: 'מסחר אלקטרוני' },
      { id: 'service', icon: Stethoscope, label: 'נותן שירות' },
      { id: 'knowledge', icon: GraduationCap, label: 'מומחה ידע' },
      { id: 'portfolio', icon: Palette, label: 'פורטפוליו' },
      { id: 'real_estate', icon: Home, label: 'נדל״ן' },
    ];
    
    const isEcommerce = data.businessModel === 'ecommerce';
    const assetLabel = isEcommerce ? "מוצרים" : "שירותים/פרויקטים";
    const currentAssetType = getAssetTypeForModel(data.businessModel);
    const visibleAssets = data.assets.filter(asset => asset.type === currentAssetType || asset.type === undefined);


    return (
      <div className="space-y-6 animate-slide-up">
        <div className="flex justify-between items-end mb-2">
            <label className="block text-lg font-medium text-gray-800">
                מודל עסקי מזוהה: <span className="text-indigo-600 font-bold">{models.find(m => m.id === data.businessModel)?.label}</span>
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

        <div>
           <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                 <ShieldCheck size={20} className="text-indigo-500"/>
                 המוצרים והשירותים באתר
              </h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                 נבחרו {visibleAssets.filter(a => a.selected).length} מתוך {visibleAssets.length}
              </span>
           </div>

           <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {visibleAssets.length > 0 ? visibleAssets.map((asset) => (
                  <div key={asset.id} className={`flex items-center gap-4 p-3 rounded-xl border transition group ${asset.selected ? 'bg-white border-indigo-200 shadow-sm' : 'bg-gray-50 border-transparent opacity-60'}`}>
                      <button 
                        onClick={() => toggleAssetSelection(asset.id)}
                        className={`flex-shrink-0 w-6 h-6 rounded-md border flex items-center justify-center transition ${asset.selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'}`}
                      >
                         {asset.selected && <Check size={14} />}
                      </button>

                      <div className="h-12 w-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {asset.imageUrl ? (
                             <img src={asset.imageUrl} alt={asset.title} className="h-full w-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} />
                          ) : (
                             isEcommerce ? <ShoppingBag size={20} className="text-gray-400"/> : <Building2 size={20} className="text-gray-400"/>
                          )}
                      </div>

                      <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                              {asset.isEditing ? (
                                  <input 
                                    autoFocus
                                    className="w-full border border-indigo-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={asset.title}
                                    onChange={(e) => updateAssetTitle(asset.id, e.target.value)}
                                    onBlur={() => toggleAssetEdit(asset.id)}
                                    onKeyDown={(e) => { if(e.key === 'Enter') toggleAssetEdit(asset.id) }}
                                  />
                              ) : (
                                  <h4 className="font-bold text-gray-800 text-sm truncate cursor-pointer" onClick={() => toggleAssetEdit(asset.id)}>{asset.title}</h4>
                              )}
                          </div>
                          <a href={asset.link} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-1 mt-0.5 truncate max-w-[200px]">
                              צפה בדף <ExternalLink size={10} />
                          </a>
                      </div>
                  </div>
              )) : (
                  <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                      <p className="text-gray-500">לא נמצאו {assetLabel} באתר.</p>
                  </div>
              )}
              
              <button 
                onClick={addNewAsset}
                className="w-full py-3 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl text-indigo-600 font-bold text-sm flex items-center justify-center gap-2 transition bg-indigo-50/50 hover:bg-indigo-50 mt-2"
              >
                 <Plus size={16} /> הוסף פריט ידנית
              </button>
           </div>
        </div>
      </div>
    );
  };

  const renderStep3_DNA = () => (
    <div className="space-y-8 animate-slide-up">
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

      <div>
        <label className="block text-lg font-medium text-gray-800 mb-2">ה-DNA והסיפור שלך (נוסח ע"י AI)</label>
        <div className="relative">
          <textarea
            rows={5}
            className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm bg-white text-gray-900"
            value={data.usp}
            onChange={(e) => updateField("usp", e.target.value)}
          />
          <div className="absolute bottom-3 left-3 bg-white border border-indigo-100 text-indigo-600 text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
            <Sparkles size={12} /> AI Generated
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep4_Visuals = () => (
    <div className="space-y-8 animate-slide-up">
      <div>
        <label className="block text-lg font-medium text-gray-800 mb-2">לוגו העסק</label>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm relative group">
             {data.logoUrl ? (
                <img src={data.logoUrl} className="h-full w-full object-contain p-2" alt="Logo" onError={(e) => { e.currentTarget.style.display='none'; }} />
             ) : (
                <span className="text-xs text-gray-400 text-center px-1">אין לוגו</span>
             )}
          </div>
          <div className="flex-1">
             {data.logoUrl ? (
                <p className="text-sm text-green-600 font-medium flex items-center gap-1 mb-2">
                    <CheckCircle2 size={16} /> לוגו נמצא
                </p>
             ) : (
                <p className="text-sm text-gray-500 mb-2">לא נמצא לוגו באתר.</p>
             )}
             <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg inline-flex items-center gap-2 transition shadow-sm text-sm">
                <Upload size={16} /> העלה ידנית
                <input type="file" className="hidden" />
             </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">צבע ראשי</label>
          <div className="flex items-center gap-3">
            <input 
              type="color" 
              value={data.primaryColor}
              onChange={(e) => updateField("primaryColor", e.target.value)}
              className="h-12 w-12 rounded-lg border-0 cursor-pointer p-1 bg-white shadow-sm"
            />
            <span className="font-mono text-gray-500 uppercase">{data.primaryColor}</span>
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
        <p className="text-gray-600 mt-2">הנתונים נשמרו בהצלחה. חבר את הרשתות החברתיות כדי להתחיל.</p>
      </div>

      <div className="space-y-4 max-w-md mx-auto">
        <button className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:bg-blue-50 transition group shadow-sm">
           <div className="flex items-center gap-3">
             <div className="bg-blue-600 p-2 rounded-lg text-white"><Facebook size={20} /></div>
             <span className="font-bold text-gray-700">Facebook Page</span>
           </div>
           <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full group-hover:bg-blue-600 group-hover:text-white transition">התחבר</span>
        </button>
        <button className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:bg-pink-50 transition group shadow-sm">
           <div className="flex items-center gap-3">
             <div className="bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-2 rounded-lg text-white"><Instagram size={20} /></div>
             <span className="font-bold text-gray-700">Instagram Business</span>
           </div>
           <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full group-hover:bg-pink-500 group-hover:text-white transition">התחבר</span>
        </button>
      </div>
    </div>
  );

  const renderWizard = () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50/50">
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 -z-10" />
      <div className="fixed top-0 left-0 w-full h-2 bg-gray-200 z-50">
        <div className="h-full bg-indigo-600 transition-all duration-500 ease-in-out" style={{ width: `${(step / 5) * 100}%` }} />
      </div>

      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[600px] relative border border-white/50 backdrop-blur-sm animate-fade-in">
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white/80 sticky top-0 z-10 backdrop-blur-md">
           <div>
             <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase mb-1 block">שלב {step} מתוך 5</span>
             <h1 className="text-2xl font-black text-gray-900">
               {step === 1 && "בוא נכיר אותך"}
               {step === 2 && "נכסים ושירותים"}
               {step === 3 && "DNA עסקי"}
               {step === 4 && "נראות ויזואלית"}
               {step === 5 && "סיום והתחברות"}
             </h1>
           </div>
           <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">{step}</div>
        </div>

        <div className="flex-1 p-8 overflow-y-auto">
          {step === 1 && renderStep1_Setup()}
          {step === 2 && renderStep2_Assets()}
          {step === 3 && renderStep3_DNA()}
          {step === 4 && renderStep4_Visuals()}
          {step === 5 && renderStep5_Connect()}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
           <button onClick={handleBack} disabled={step === 1} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition ${step === 1 ? "opacity-0 pointer-events-none" : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"}`}>
             <ArrowRight size={20} /> חזרה
           </button>
           {step < 5 ? (
             <button onClick={handleNext} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-transform active:scale-95">
               המשך <ArrowLeft size={20} />
             </button>
           ) : (
             <button onClick={() => alert("הרשמה הושלמה!")} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-200 transition-transform active:scale-95">
               סיום <CheckCircle2 size={20} />
             </button>
           )}
        </div>
      </div>
      
      <div className="mt-8 text-gray-400 text-sm font-medium flex items-center gap-2">
        <Sparkles size={14} /> Powered by Trendz
      </div>
    </div>
  );

  if (viewMode === 'landing') return renderLanding();
  if (viewMode === 'analyzing') return renderAnalyzing();
  return renderWizard();
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}