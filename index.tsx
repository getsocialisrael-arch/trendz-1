import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from '@google/genai';
import { 
  Building2, 
  User, 
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
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Plus,
  ExternalLink,
  Check,
  X,
  RefreshCcw,
  AlertCircle,
  Search,
  Link as LinkIcon,
  Package, // Changed from ShieldCheck
  Zap,
  BrainCircuit,
  FileText,
  MessageSquarePlus,
  Trash2,
  Pencil
} from 'lucide-react';

// Initialize AI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Types & Schema ---

interface AssetItem {
  id: string;
  title: string;
  type: 'product' | 'service' | 'property' | 'project' | 'course';
  imageUrl?: string;
  images?: string[]; // Support for multiple images
  link?: string;
  selected: boolean;
  isEditing?: boolean;
  isVerified?: boolean; 
  description?: string;
  aiInstructions?: string;
  price?: string; // New field
}

type PageType = 'product' | 'category' | 'blog' | 'general';

interface SiteLink {
    title: string;
    url: string;
    type: PageType;
}

interface AudiencePersona {
    title: string;
    description: string;
    selected: boolean; 
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
  siteMap: SiteLink[]; 
  persona: string;
  usp: string;
  targetAudiences: AudiencePersona[]; 
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
  siteMap: [],
  persona: "me",
  usp: "",
  targetAudiences: [], 
  marketingGoal: "sales",
  primaryColor: "#6c39ca",
  secondaryColor: "#e0e7ff", 
  logoUrl: "",
};

// Helper: Fetch via multiple proxies
const fetchViaProxy = async (targetUrl: string): Promise<string> => {
    const timestamp = Date.now(); 
    const strategies = [
        async () => {
            const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
            if (!res.ok) throw new Error(`CORS Proxy failed: ${res.status}`);
            return res.text();
        },
        async () => {
            const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}&t=${timestamp}`);
            if (!res.ok) throw new Error(`AllOrigins failed: ${res.status}`);
            return res.text();
        }
    ];

    for (const strategy of strategies) {
        try {
            const content = await strategy();
            if (content && content.length > 50) return content;
        } catch (e) {
            console.warn("Proxy strategy failed, trying next...", e);
        }
    }
    throw new Error("Failed to fetch via all proxies");
};

// Helper: Infer page type from URL
const inferPageType = (url: string): PageType => {
    const lower = url.toLowerCase();
    if (lower.includes('/product') || lower.includes('/item') || lower.includes('/p/')) return 'product';
    if (lower.includes('/collection') || lower.includes('/category') || lower.includes('/c/')) return 'category';
    if (lower.includes('/blog') || lower.includes('/news') || lower.includes('/article') || lower.includes('/post')) return 'blog';
    return 'general';
};

export default function WebsiteAnalyzer() {
  const [viewMode, setViewMode] = useState<'landing' | 'analyzing' | 'wizard'>('landing');
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0); 
  const [landingUrl, setLandingUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRegeneratingUSP, setIsRegeneratingUSP] = useState(false);
  const [isRegeneratingAudience, setIsRegeneratingAudience] = useState(false);

  // Modal State
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'search' | 'custom'>('search'); // New Tab State
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [selectedSiteLinks, setSelectedSiteLinks] = useState<Set<string>>(new Set());
  
  // Custom Asset Form State
  const [customAssetForm, setCustomAssetForm] = useState({
      title: '',
      description: '',
      aiInstructions: '',
      price: '',
      images: [] as string[]
  });
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [customAssetSuccess, setCustomAssetSuccess] = useState(false);

  const fetchWithJina = async (targetUrl: string): Promise<string> => {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    try {
        const res = await fetch(jinaUrl);
        if (res.ok) {
            const text = await res.text();
            if (text.length > 50) return text;
        }
    } catch (e) {
        console.log("Direct Jina fetch failed, trying proxy...");
    }
    return fetchViaProxy(jinaUrl);
  };

  const fetchSitemap = async (baseUrl: string): Promise<SiteLink[]> => {
    const candidates = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap.txt'];
    const leaves: SiteLink[] = [];
    const visited = new Set<string>();

    const decodeXml = (str: string) => {
        return str.replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'");
    };

    const isSitemap = (url: string) => {
        const lower = url.toLowerCase();
        return (lower.includes('sitemap') && (lower.includes('.xml') || lower.includes('.txt'))) || lower.includes('.xml');
    };

    const crawl = async (url: string, depth: number) => {
        if (depth > 2) return;
        if (visited.has(url)) return;
        visited.add(url);

        try {
            const xml = await fetchViaProxy(url);
            if (!xml || (!xml.includes('<loc>') && !xml.includes('http'))) return;

            const locRegex = /<loc>(.*?)<\/loc>/g;
            let match;
            const urlsInFile: string[] = [];

            while ((match = locRegex.exec(xml)) !== null) {
                urlsInFile.push(decodeXml(match[1].trim()));
            }

            const promises = urlsInFile.map(async (childUrl) => {
                if (isSitemap(childUrl)) {
                    await crawl(childUrl, depth + 1);
                } else {
                    if (!visited.has(childUrl)) {
                        visited.add(childUrl);
                        let title = childUrl.split('/').filter(Boolean).pop() || childUrl;
                        title = title.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\.html$/, '').replace(/\.php$/, '');
                        if (title.includes('?')) title = title.split('?')[0];
                        title = title.replace(/\b\w/g, c => c.toUpperCase());
                        try { title = decodeURIComponent(title); } catch (e) {}
                        
                        if (!childUrl.includes('.xml')) {
                             leaves.push({ 
                                 title, 
                                 url: childUrl,
                                 type: inferPageType(childUrl)
                             });
                        }
                    }
                }
            });
            await Promise.all(promises);
        } catch (e) {
            console.warn(`Failed to process sitemap: ${url}`, e);
        }
    };

    for (const path of candidates) {
        const entryUrl = new URL(path, baseUrl).href;
        await crawl(entryUrl, 0);
        if (leaves.length > 0) break;
    }
    return leaves;
  };

  const handleMagicAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoadingProgress(0);
    
    let cleanUrl = landingUrl.trim();
    if (!cleanUrl) return;

    const isPhoneNumber = /^[\d\-\s\+]+$/.test(cleanUrl) && cleanUrl.replace(/\D/g, '').length >= 7;
    if (isPhoneNumber) {
        setError("נראה שהזנת מספר טלפון. נא להזין כתובת אתר תקינה (לדוגמה: example.co.il)");
        return;
    }

    if (!cleanUrl.includes('.') && cleanUrl.toLowerCase() !== 'localhost') {
        setError("כתובת האתר אינה תקינה. חסרה סיומת (כמו .co.il או .com)");
        return;
    }

    try {
        const urlToTest = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
        const urlObj = new URL(urlToTest);
        if (!urlObj.hostname.includes('.') && urlObj.hostname !== 'localhost') throw new Error("Invalid hostname");
    } catch (err) {
        setError("כתובת האתר אינה תקינה. נא לבדוק ולנסות שוב.");
        return;
    }

    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;

    // --- FUNNY LOADING MESSAGES START ---
    const domainName = cleanUrl.replace(/^https?:\/\//, '').split('/')[0];
    const FUNNY_MESSAGES = [
        `מציץ ב-${domainName} במהירות האור...`,
        "בודק איזה צבעים בחרת לאתר...",
        "קורא את כל הטקסט (מבטיח לא להתעייף)...",
        "מכין קפה ל-AI...",
        "מחפש את הכפתורים הכי שווים...",
        `חושב איך לשווק את ${domainName} לירח...`,
        "בודק אם הפונט הזה באמת מתאים...",
        "מזקק את הגאונות העסקית שלך...",
        "סופר כמה פעמים כתוב 'אנחנו'...",
        "מארגן את המילים הנכונות..."
    ];

    setViewMode('analyzing');
    setLoadingMsg(FUNNY_MESSAGES[0]);

    // Rotate messages every 2.5 seconds
    const msgInterval = setInterval(() => {
        setLoadingMsg(prev => {
            const currentIndex = FUNNY_MESSAGES.indexOf(prev);
            const nextIndex = (currentIndex + 1) % FUNNY_MESSAGES.length;
            return FUNNY_MESSAGES[nextIndex];
        });
    }, 2500);
    // --- FUNNY LOADING MESSAGES END ---
    
    const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => {
            if (prev >= 90) return prev;
            return prev + (Math.random() * 5);
        });
    }, 200);

    try {
      // Note: We removed the static setLoadingMsg calls to let the funny messages rotate
      const sitemapPromise = fetchSitemap(cleanUrl);
      const contentPromise = fetchWithJina(cleanUrl)
        .then(text => ({ type: 'markdown', content: text }))
        .catch(e => null);
      
      const htmlPromise = fetchViaProxy(cleanUrl)
        .then(text => ({ type: 'html', content: text }))
        .catch(e => null);

      const [sitemapLinks, contentResult, htmlResult] = await Promise.all([
          sitemapPromise.catch(() => []),
          contentPromise,
          htmlPromise
      ]);

      let mainContent = "";
      let visualContext = "";

      if (contentResult?.content && contentResult.content.length > 100) {
          mainContent = contentResult.content;
      } else if (htmlResult?.content) {
          mainContent = htmlResult.content;
      } else {
          throw new Error("לא הצלחנו לקרוא את תוכן האתר. ייתכן שהאתר חוסם גישה.");
      }

      if (htmlResult?.content) {
          visualContext = htmlResult.content.substring(0, 20000);
      }

      const linkRegex = /href=["'](.*?)["']|\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
      const extractedLinks: SiteLink[] = [];
      const seenUrls = new Set<string>(sitemapLinks.map(l => l.url));
      
      const resolveUrl = (url?: string) => {
        if (!url) return undefined;
        let cleaned = url.trim();
        if (cleaned.startsWith('http')) return cleaned;
        if (cleaned.startsWith('//')) return `https:${cleaned}`;
        try {
          const base = cleanUrl.endsWith('/') ? cleanUrl : cleanUrl + '/';
          if (base.endsWith('/') && cleaned.startsWith('/')) cleaned = cleaned.substring(1);
          return new URL(cleaned, base).href;
        } catch {
          return cleaned;
        }
      };

      let match;
      let iterations = 0;
      while ((match = linkRegex.exec(mainContent)) !== null && iterations < 500) {
          iterations++;
          const rawUrl = match[1] || match[3];
          const title = match[2] || "Link";
          const fullUrl = resolveUrl(rawUrl);

          if (fullUrl && fullUrl.startsWith('http') && !seenUrls.has(fullUrl)) {
              if (!fullUrl.includes('facebook.com') && !fullUrl.includes('instagram.com') && !fullUrl.includes('waze.com') && !fullUrl.includes('mailto:')) {
                  extractedLinks.push({ 
                      title: title === "Link" ? fullUrl.split('/').pop() || "Link" : title, 
                      url: fullUrl,
                      type: inferPageType(fullUrl)
                  });
                  seenUrls.add(fullUrl);
              }
          }
      }

      const finalSiteMap = [...sitemapLinks, ...extractedLinks];

      const extractionPrompt = `
        You are an expert web scraper. I will provide you with the content of a website: ${cleanUrl}.
        
        YOUR TASK: Extract structured business data, colors, and specific assets.

        SOURCE CONTENT (Text/Markdown - for Business Info):
        ${mainContent.substring(0, 40000)} 

        VISUAL CONTEXT (Raw HTML - for Colors & Logo):
        ${visualContext}

        INSTRUCTIONS:
        1. **Business Info**: Extract name, Hebrew USP.
        
        2. **Visuals (Crucial)**: 
           - **Primary Color**: LOOK at the 'VISUAL CONTEXT'. Search for 'background-color', 'color', or specific HEX codes in style tags. 
             If you see a dominant color (e.g. orange, blue, green), use its HEX. 
             Example: if site is 'PetSock', look for branding colors.
           - **Secondary Color**: Look for a secondary brand color often used for accents, footers, or secondary buttons.
           - **Logo**: Look in 'VISUAL CONTEXT' for <link rel="icon">, <meta property="og:image">, or <img> tags with class/id 'logo'.
        
        3. **Target Audience (3 Personas)**:
           Analyze the website content to identify 3 distinct target audience personas.
           Generate a "Flash Profile" for each persona in Hebrew.

           Constraints for the Description:
           1. Length: Maximum 40 words per persona. Keep it tight.
           2. Structure: Write exactly 3 short, flowing sentences (No bullet points, no labels, no emojis).
           3. Flow:
              - Sentence 1: The specific persona + their conflict ("They want X but hate Y").
              - Sentence 2: The core fear/friction ("They are afraid of...").
              - Sentence 3: The marketing angle ("The goal is to sell them...").
           4. Tone: Professional, direct, "Israeli Tachles".
           
        4. **Assets**: Look for lists of items (Products/Services/Courses).
           - **Extract at least 3-6 items.**
           - **Link**: Must be the specific link to that item.
           - **Image**: Must be the specific image URL.
           - **Title**: The name of the item.

        OUTPUT JSON SCHEMA:
        {
          "business_name": "string",
          "business_model": "ecommerce | service | knowledge | portfolio | real_estate",
          "description_usp": "Hebrew string",
          "target_audiences": [
            {
              "title": "Short catchy title (e.g., ההייטקיסט החרד)",
              "description": "The 3-sentence clean text block."
            }
          ],
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

      const mappedAssets: AssetItem[] = (json.extracted_assets || [])
        .map((a: any, index: number) => ({
            id: `asset-${index}`,
            title: a.title || "פריט ללא שם",
            type: a.type || getAssetTypeForModel(json.business_model || "service"),
            imageUrl: resolveUrl(a.imageUrl),
            images: resolveUrl(a.imageUrl) ? [resolveUrl(a.imageUrl)] : [],
            link: resolveUrl(a.link) || cleanUrl,
            selected: true,
            isEditing: false,
            isVerified: true
        }));

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

      const audiences = (json.target_audiences || []).map((a: any) => ({
          ...a,
          selected: true 
      }));

      setData(prev => ({
        ...prev,
        hasWebsite: true,
        websiteUrl: cleanUrl,
        businessName: json.business_name || cleanUrl.replace(/^https?:\/\//, '').split('.')[0],
        businessModel: json.business_model || "service",
        assets: mappedAssets,
        siteMap: finalSiteMap, 
        usp: json.description_usp || "",
        targetAudiences: audiences,
        primaryColor: json.visuals?.primary_color || "#6c39ca",
        secondaryColor: json.visuals?.secondary_color || "#e0e7ff",
        logoUrl: resolveUrl(json.visuals?.logo_url),
        persona: "brand",
        contactName: "",
        phone: "",
        email: ""
      }));

      clearInterval(progressInterval);
      clearInterval(msgInterval); // Stop rotation
      setLoadingProgress(100);
      
      setTimeout(() => {
          setStep(1);
          setViewMode('wizard');
      }, 500);

    } catch (err) {
      console.error(err);
      clearInterval(progressInterval);
      clearInterval(msgInterval); // Stop rotation
      setError("לא הצלחנו לקרוא את האתר באופן אוטומטי. ייתכן שהוא חסום לסריקה. אנא מלא את הפרטים ידנית.");
      setViewMode('landing'); 
    }
  };

  const handleRegenerateUSP = async () => {
    if (isRegeneratingUSP) return;
    setIsRegeneratingUSP(true);
    try {
        const prompt = `
        You are a factual business analyst.
        Write a concise, informative description in Hebrew for a business named "${data.businessName}".
        Business Model: ${data.businessModel}.
        Website URL: ${data.websiteUrl}.
        Current Draft: "${data.usp}"
        
        CRITICAL INSTRUCTIONS:
        - Do NOT write an advertisement or marketing copy.
        - Do NOT use exclamation marks.
        - Do NOT use phrases like "Come visit us" or "The best in the world".
        - Simply describe WHAT the business does, what services/products it sells, and who it serves.
        - Keep it dry, professional, and clear.
        - Max 250 characters.
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        
        const newText = response.text?.trim();
        if (newText) {
            updateField("usp", newText);
        }
    } catch (e) {
        console.error("Failed to regenerate USP", e);
    } finally {
        setIsRegeneratingUSP(false);
    }
  };

  const handleRegenerateAudience = async () => {
    if (isRegeneratingAudience) return;
    setIsRegeneratingAudience(true);
    try {
        const assetsList = data.assets.map(a => a.title).join(", ");
        const prompt = `
        You are a world-class Consumer Psychologist. 
        Analyze the website content to identify 3 distinct target audience personas for:
        
        Business Name: ${data.businessName}
        Model: ${data.businessModel}
        Description: ${data.usp}
        Products/Services: ${assetsList}

        TASK:
        Generate a "Flash Profile" for each persona in Hebrew.

        Constraints for the Description:
        1. Length: Maximum 40 words per persona. Keep it tight.
        2. Structure: Write exactly 3 short, flowing sentences (No bullet points, no labels, no emojis).
        3. Flow:
           - Sentence 1: The specific persona + their conflict ("They want X but hate Y").
           - Sentence 2: The core fear/friction ("They are afraid of...").
           - Sentence 3: The marketing angle ("The goal is to sell them...").
        4. Tone: Professional, direct, "Israeli Tachles".

        JSON Output Format:
        {
          "audiences": [
            {
              "title": "Short catchy title (e.g., ההייטקיסט החרד)",
              "description": "The 3-sentence clean text block."
            }
          ]
        }
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        
        const json = JSON.parse(response.text || "{}");
        if (json.audiences && Array.isArray(json.audiences)) {
            const newAudiences = json.audiences.map((a: any) => ({ ...a, selected: true }));
            updateField("targetAudiences", newAudiences);
        }
    } catch (e) {
        console.error("Failed to regenerate Audience", e);
    } finally {
        setIsRegeneratingAudience(false);
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
  
  const updateAudience = (index: number, field: keyof AudiencePersona, value: string) => {
      setData(prev => {
          const newAudiences = [...prev.targetAudiences];
          if (newAudiences[index]) {
              newAudiences[index] = { ...newAudiences[index], [field]: value };
          }
          return { ...prev, targetAudiences: newAudiences };
      });
  };

  const toggleAudienceSelection = (index: number) => {
      setData(prev => {
          const newAudiences = [...prev.targetAudiences];
          if (newAudiences[index]) {
              newAudiences[index] = { ...newAudiences[index], selected: !newAudiences[index].selected };
          }
          return { ...prev, targetAudiences: newAudiences };
      });
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

  // --- Modal Logic ---

  const openAddAssetModal = () => {
    setAssetSearchQuery("");
    setSelectedSiteLinks(new Set());
    setModalTab('search');
    setCustomAssetForm({
        title: '',
        description: '',
        aiInstructions: '',
        price: '',
        images: []
    });
    setEditingAssetId(null);
    setCustomAssetSuccess(false);
    setIsAssetModalOpen(true);
  };
  
  const openEditAssetModal = (asset: AssetItem) => {
    setModalTab('custom');
    setCustomAssetForm({
        title: asset.title,
        description: asset.description || '',
        aiInstructions: asset.aiInstructions || '',
        price: asset.price || '',
        images: asset.images || (asset.imageUrl ? [asset.imageUrl] : [])
    });
    setEditingAssetId(asset.id);
    setCustomAssetSuccess(false);
    setIsAssetModalOpen(true);
  };

  const closeAddAssetModal = () => {
    setIsAssetModalOpen(false);
  };

  const toggleModalLinkSelection = (url: string) => {
    const newSet = new Set(selectedSiteLinks);
    if (newSet.has(url)) {
        newSet.delete(url);
    } else {
        newSet.add(url);
    }
    setSelectedSiteLinks(newSet);
  };

  const addSelectedAssetsFromModal = () => {
    if (selectedSiteLinks.size === 0) return;

    const newAssets: AssetItem[] = [];
    const type = getAssetTypeForModel(data.businessModel);

    data.siteMap.forEach(link => {
        if (selectedSiteLinks.has(link.url)) {
             newAssets.push({
                id: `manual-map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: link.title || "דף ללא שם",
                type: type,
                link: link.url,
                selected: true,
                isEditing: false, 
                isVerified: true
             });
        }
    });

    setData(prev => ({
        ...prev,
        assets: [...prev.assets, ...newAssets]
    }));

    closeAddAssetModal();
  };

  const handleCustomFormChange = (field: string, value: string) => {
      setCustomAssetForm(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
          Array.from(files).forEach(file => {
             const reader = new FileReader();
             reader.onloadend = () => {
                 setCustomAssetForm(prev => ({ 
                     ...prev, 
                     images: [...prev.images, reader.result as string] 
                 }));
             };
             reader.readAsDataURL(file);
          });
      }
  };

  const removeImage = (indexToRemove: number) => {
      setCustomAssetForm(prev => ({
          ...prev,
          images: prev.images.filter((_, idx) => idx !== indexToRemove)
      }));
  };

  const handleSaveCustomAsset = () => {
      if (!customAssetForm.title.trim()) return;

      const type = getAssetTypeForModel(data.businessModel);
      
      if (editingAssetId) {
          // Update Existing
          setData(prev => ({
              ...prev,
              assets: prev.assets.map(a => a.id === editingAssetId ? {
                  ...a,
                  title: customAssetForm.title,
                  description: customAssetForm.description,
                  aiInstructions: customAssetForm.aiInstructions,
                  price: customAssetForm.price,
                  imageUrl: customAssetForm.images[0] || '',
                  images: customAssetForm.images
              } : a)
          }));
      } else {
          // Add New
          const newAsset: AssetItem = {
              id: `custom-${Date.now()}`,
              title: customAssetForm.title,
              description: customAssetForm.description,
              aiInstructions: customAssetForm.aiInstructions,
              price: customAssetForm.price,
              imageUrl: customAssetForm.images[0] || '',
              images: customAssetForm.images,
              type: type,
              selected: true,
              isEditing: false,
              isVerified: true
          };
          setData(prev => ({
              ...prev,
              assets: [...prev.assets, newAsset]
          }));
      }

      // Show success and clear/close
      setCustomAssetSuccess(true);
      setTimeout(() => {
          setCustomAssetSuccess(false);
          if (editingAssetId) closeAddAssetModal();
          else {
              setCustomAssetForm({
                  title: '',
                  description: '',
                  aiInstructions: '',
                  price: '',
                  images: []
              });
          }
      }, 1000);
  };

  const handleNext = () => { if (step < 6) setStep(step + 1); }; 
  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const getStepDescription = (currentStep: number) => {
      switch(currentStep) {
          case 1: return "כדי שנוכל ליצור איתך קשר ולייצר חתימה אישית בפוסטים, אנו זקוקים לפרטי הבסיס של העסק.";
          case 2: return "ה-AI ינתח את המוצרים והשירותים האלו כדי לבנות עבורם תוכן שיווקי שמניע לפעולה.";
          case 3: return "הגדרת הסגנון והייחודיות תעזור ל-AI לדבר בשפה שלך, כדי שהתוכן ירגיש אותנטי ומקצועי.";
          case 4: return "ככל שנבין טוב יותר למי אנחנו פונים, כך נוכל לייצר מסרים שפוגעים בדיוק בכאבים וברצונות שלהם.";
          case 5: return "הלוגו וצבעי המותג ישולבו באופן אוטומטי בכל התמונות והעיצובים שהמערכת תייצר עבורך.";
          case 6: return "חיבור הרשתות החברתיות יאפשר לנו לפרסם את התוכן שנוצר באופן אוטומטי, ולחסוך לך זמן יקר.";
          default: return "";
      }
  };

  // --- Render Functions ---

  const renderLanding = () => (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

      <div className="max-w-2xl w-full text-center z-10 animate-fade-in space-y-8">
        <div className="flex justify-center mb-6">
           <img 
              src="https://kzcqheuwimzxgkrivorj.supabase.co/storage/v1/object/public/logos/4d9af8fc-9c20-4311-9546-a77acd37b6ef/logo-1758153667341.png" 
              alt="Trendz Logo" 
              className="h-12 object-contain drop-shadow-sm"
           />
        </div>
        
        <h1 className="text-4xl md:text-6xl font-black text-gray-900 tracking-tight leading-tight">
          הפוך את האתר שלך <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">למכונת שיווק אוטומטית</span>
        </h1>
        
        <p className="text-xl text-gray-500 max-w-lg mx-auto leading-relaxed">
          הכנס את כתובת האתר שלך, וה-AI שלנו יקרא אותו (Reader Mode) כדי לדייק ב-100% בפרטים.
        </p>

        <form onSubmit={handleMagicAnalyze} className="w-full max-w-lg mx-auto relative group px-1 md:px-0">
           <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
           <div className="relative flex items-center gap-2 bg-white rounded-xl shadow-xl p-1 md:p-2 border border-gray-100 transition-all">
             <Globe className="ml-3 mr-2 md:ml-3 md:mr-4 text-gray-400 flex-shrink-0 w-4 h-4 md:w-6 md:h-6" />
             <input 
               type="text" 
               placeholder="example.co.il" 
               className="flex-1 text-sm md:text-lg outline-none text-gray-900 placeholder-gray-400 py-2.5 md:py-3 text-left bg-white min-w-0"
               dir="ltr"
               value={landingUrl}
               onChange={(e) => setLandingUrl(e.target.value)}
             />
             <button 
               type="submit"
               className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 md:px-8 py-2 md:py-3 rounded-lg font-bold text-sm md:text-lg transition-all shadow-md hover:shadow-lg flex items-center gap-2 whitespace-nowrap flex-shrink-0 ml-1 md:ml-0"
             >
               נתח עכשיו
               <ArrowLeft size={16} className="md:w-5 md:h-5" />
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
         <div className="relative bg-white p-6 rounded-full shadow-xl border border-indigo-50 flex items-center justify-center">
           {loadingMsg.includes("Jina") ? (
             <Zap className="h-12 w-12 text-indigo-600 animate-pulse" />
           ) : (
             <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
           )}
         </div>
       </div>
       <h2 className="text-2xl font-bold text-gray-900 mb-2 max-w-md mx-auto min-h-[60px] transition-all animate-fade-in flex items-center justify-center">{loadingMsg}</h2>
       <div className="w-64 h-2 bg-gray-100 rounded-full mt-4 mx-auto overflow-hidden">
          <div className="h-full bg-indigo-600 transition-all duration-200" style={{ width: `${loadingProgress}%` }}></div>
       </div>
       <p className="text-sm font-bold text-indigo-600 mt-2">{Math.round(loadingProgress)}%</p>
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
        
        <div className="flex md:grid md:grid-cols-5 gap-3 mb-8 overflow-x-auto pb-2 -mx-5 px-5 md:mx-0 md:px-0 scrollbar-hide snap-x">
          {models.map((m) => {
            const Icon = m.icon;
            const isSelected = data.businessModel === m.id;
            return (
              <button
                key={m.id}
                onClick={() => updateField("businessModel", m.id)}
                className={`p-2 rounded-xl border transition-all flex flex-col items-center justify-center gap-2 flex-shrink-0 w-28 md:w-auto snap-center aspect-square md:aspect-auto ${
                  isSelected ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-bold" : "border-gray-200 hover:border-indigo-300 bg-white text-gray-500"
                }`}
              >
                 <Icon size={24} className={isSelected ? "text-indigo-600" : "text-gray-400"} />
                 <span className="text-sm text-center leading-tight">{m.label}</span>
              </button>
            )
          })}
        </div>

        <div>
           <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                 <Package size={20} className="text-indigo-500"/>
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

                      <div className="h-12 w-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
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
                          
                          <div className="flex items-center gap-2 mt-0.5">
                              {asset.link && asset.link !== '#' && (
                                <a href={asset.link} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-1 truncate max-w-[200px]">
                                    צפה בדף <ExternalLink size={10} />
                                </a>
                              )}
                              {asset.description && (
                                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded flex items-center gap-0.5" title={asset.description}>
                                      <FileText size={8} /> תיאור
                                  </span>
                              )}
                          </div>
                      </div>
                      
                      <button 
                         onClick={() => openEditAssetModal(asset)}
                         className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition opacity-0 group-hover:opacity-100"
                         title="ערוך פרטים מלאים"
                      >
                          <Pencil size={16} />
                      </button>
                  </div>
              )) : (
                  <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                      <p className="text-gray-500">לא נמצאו {assetLabel} באתר.</p>
                  </div>
              )}
              
              <button 
                onClick={openAddAssetModal}
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
        <label className="block text-lg font-medium text-gray-800 mb-2">תיאור העסק</label>
        <div className="relative">
          <textarea
            rows={4}
            className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm bg-white text-gray-900"
            value={data.usp}
            onChange={(e) => updateField("usp", e.target.value)}
          />
          <button 
            onClick={handleRegenerateUSP}
            disabled={isRegeneratingUSP}
            className="absolute bottom-3 left-3 bg-white border border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 text-indigo-600 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm transition-all z-10"
            type="button"
          >
            {isRegeneratingUSP ? (
                <Loader2 size={12} className="animate-spin" />
            ) : (
                <Sparkles size={12} />
            )}
            {isRegeneratingUSP ? "כותב מחדש..." : "נסח עם AI"}
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep4_Audience = () => (
    <div className="space-y-8 animate-slide-up">
       <div>
        <div className="flex items-center justify-between mb-2">
            <div>
                 <label className="block text-lg font-medium text-gray-800">ניתוח קהל יעד</label>
                 <p className="text-sm text-gray-500">בחר את הפרסונות הרלוונטיות עבור העסק שלך</p>
            </div>
            
            <button 
                onClick={handleRegenerateAudience}
                disabled={isRegeneratingAudience}
                className="text-indigo-600 text-xs font-bold hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 transition"
                type="button"
            >
                {isRegeneratingAudience ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
                {isRegeneratingAudience ? "מנתח מחדש..." : "נתח שוב"}
            </button>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
            {data.targetAudiences && data.targetAudiences.length > 0 ? (
                data.targetAudiences.map((audience, idx) => (
                    <div 
                        key={idx} 
                        className={`p-4 rounded-xl border shadow-sm transition group cursor-pointer ${audience.selected ? 'bg-indigo-50/50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                        onClick={() => toggleAudienceSelection(idx)}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition flex-shrink-0 ${audience.selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
                                {audience.selected && <Check size={14} className="text-white" />}
                            </div>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    className="w-full font-bold text-gray-900 mb-2 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-500 outline-none pb-1"
                                    value={audience.title}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateAudience(idx, 'title', e.target.value)}
                                    placeholder="כותרת הפרסונה"
                                />
                                <textarea
                                    rows={3}
                                    className="w-full text-sm text-gray-600 bg-transparent resize-none outline-none border border-transparent rounded p-1 hover:border-gray-200 focus:border-indigo-500 focus:bg-white"
                                    value={audience.description}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateAudience(idx, 'description', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                ))
            ) : (
                <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-500 text-sm mb-2">טרם זוהו פרסונות.</p>
                    <button 
                        onClick={handleRegenerateAudience}
                        className="text-indigo-600 font-bold text-sm hover:underline"
                    >
                        לחץ כאן ליצירת פרופילים
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );

  const renderStep5_Visuals = () => (
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

  const renderStep6_Connect = () => (
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
    <div className="min-h-screen flex flex-col items-center justify-center md:p-4 p-0 bg-gray-50/50">
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 -z-10" />
      <div className="fixed top-0 left-0 w-full h-1.5 bg-gray-200 z-50">
        <div className="h-full bg-indigo-600 transition-all duration-500 ease-in-out" style={{ width: `${(step / 6) * 100}%` }} />
      </div>

      <div className="w-full md:max-w-3xl bg-white md:rounded-3xl md:shadow-xl overflow-hidden flex flex-col min-h-screen md:min-h-[600px] relative md:border md:border-white/50 backdrop-blur-sm animate-fade-in">
        <div className="p-5 md:p-8 border-b border-gray-100 bg-white/95 sticky top-0 z-30 backdrop-blur-md">
           <div className="flex justify-between items-start mb-1">
               <div>
                 <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase mb-1 block">שלב {step} מתוך 6</span>
                 <h1 className="text-xl md:text-2xl font-black text-gray-900 mb-1 leading-tight">
                   {step === 1 && "בוא נכיר אותך"}
                   {step === 2 && "נכסים ושירותים"}
                   {step === 3 && "DNA עסקי"}
                   {step === 4 && "קהל יעד"}
                   {step === 5 && "נראות ויזואלית"}
                   {step === 6 && "סיום והתחברות"}
                 </h1>
                 <p className="text-gray-500 text-sm max-w-lg leading-relaxed hidden md:block">
                    {getStepDescription(step)}
                 </p>
               </div>
               <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0 text-sm md:text-base">{step}</div>
           </div>
           <p className="text-gray-500 text-sm leading-relaxed md:hidden">
              {getStepDescription(step)}
           </p>
        </div>

        <div className="flex-1 p-5 md:p-8 overflow-y-auto pb-28 md:pb-8">
          {step === 1 && renderStep1_Setup()}
          {step === 2 && renderStep2_Assets()}
          {step === 3 && renderStep3_DNA()}
          {step === 4 && renderStep4_Audience()}
          {step === 5 && renderStep5_Visuals()}
          {step === 6 && renderStep6_Connect()}
        </div>

        <div className="p-4 md:p-6 bg-white md:bg-gray-50 border-t border-gray-200 flex justify-between items-center sticky bottom-0 z-30 md:relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:shadow-none">
           <button onClick={handleBack} disabled={step === 1} className={`flex items-center gap-2 px-4 md:px-6 py-3 rounded-xl font-medium transition active:scale-95 ${step === 1 ? "opacity-0 pointer-events-none" : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"}`}>
             <ArrowRight size={18} /> <span className="hidden md:inline">חזרה</span>
           </button>
           
           <div className="flex items-center gap-3 md:gap-4">
               {step < 6 && (
                    <button onClick={handleNext} className="text-gray-400 font-medium hover:text-gray-600 text-sm px-2">
                        דלג
                    </button>
               )}
               
               {step < 6 ? (
                 <button onClick={handleNext} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 md:px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-transform active:scale-95">
                   המשך <ArrowLeft size={20} />
                 </button>
               ) : (
                 <button onClick={() => alert("הרשמה הושלמה!")} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 md:px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-200 transition-transform active:scale-95">
                   סיום <CheckCircle2 size={20} />
                 </button>
               )}
           </div>
        </div>
      </div>
      
      <div className="mt-8 text-gray-400 text-sm font-medium items-center gap-2 hidden md:flex">
        <Sparkles size={14} /> Powered by Trendz
      </div>

      {/* --- ADD ASSET MODAL --- */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center md:p-4 p-0">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={closeAddAssetModal}></div>
            <div className="bg-white w-full h-full md:h-auto md:max-w-2xl md:rounded-2xl shadow-2xl relative flex flex-col md:max-h-[85vh] animate-fade-in overflow-hidden">
                <div className="p-0 bg-white border-b border-gray-100 flex flex-col">
                    <div className="flex items-center justify-between p-4 md:p-6 pb-2">
                        <h3 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                            {modalTab === 'search' ? <Search className="text-indigo-600" size={20}/> : <Plus className="text-indigo-600" size={20}/>}
                            {editingAssetId ? "עריכת פריט" : (modalTab === 'search' ? "חיפוש דפים באתר" : "הוספת פריט ידני")}
                        </h3>
                        <button onClick={closeAddAssetModal} className="p-2 hover:bg-gray-100 rounded-full transition">
                            <X size={20} className="text-gray-500" />
                        </button>
                    </div>
                    
                    {!editingAssetId && (
                        <div className="flex px-4 md:px-6 gap-6 mt-2">
                            <button 
                                onClick={() => setModalTab('search')}
                                className={`pb-3 text-sm font-bold transition border-b-2 ${modalTab === 'search' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                חיפוש מהאתר
                            </button>
                            <button 
                                onClick={() => setModalTab('custom')}
                                className={`pb-3 text-sm font-bold transition border-b-2 ${modalTab === 'custom' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                יצירה ידנית
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
                    {modalTab === 'search' ? (
                        <div className="flex flex-col h-full p-4 md:p-6">
                            <div className="relative mb-4">
                                <input 
                                    autoFocus
                                    type="text"
                                    placeholder="חפש דפים, מוצרים או שירותים..."
                                    className="w-full pl-4 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition text-gray-900 bg-white"
                                    value={assetSearchQuery}
                                    onChange={(e) => setAssetSearchQuery(e.target.value)}
                                />
                                <Search className="absolute right-4 top-3.5 text-gray-400" size={20} />
                            </div>

                            <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl bg-white p-2 space-y-2 min-h-[200px]">
                                {data.siteMap
                                .filter(link => link.title.toLowerCase().includes(assetSearchQuery.toLowerCase()) || link.url.includes(assetSearchQuery.toLowerCase()))
                                .map((link, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 transition group">
                                        <label className="flex-1 flex items-start gap-3 cursor-pointer min-w-0">
                                            <div className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition flex-shrink-0 ${selectedSiteLinks.has(link.url) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
                                                {selectedSiteLinks.has(link.url) && <Check size={14} className="text-white" />}
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                className="hidden"
                                                checked={selectedSiteLinks.has(link.url)}
                                                onChange={() => toggleModalLinkSelection(link.url)}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="font-bold text-gray-800 text-sm truncate">{link.title || link.url}</span>
                                                    {link.type === 'product' && <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">מוצר</span>}
                                                    {link.type === 'category' && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">קטגוריה</span>}
                                                    {link.type === 'blog' && <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">בלוג</span>}
                                                    {link.type === 'general' && <span className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">דף</span>}
                                                </div>
                                                <div className="text-xs text-gray-400 truncate flex items-center gap-1">
                                                    <LinkIcon size={10} /> {link.url}
                                                </div>
                                            </div>
                                        </label>
                                        <a 
                                            href={link.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition"
                                            title="פתח קישור"
                                        >
                                            <ExternalLink size={16} />
                                        </a>
                                    </div>
                                ))}
                                
                                {data.siteMap.filter(link => link.title.toLowerCase().includes(assetSearchQuery.toLowerCase())).length === 0 && (
                                    <div className="text-center py-10">
                                        <Search className="mx-auto text-gray-300 mb-2" size={32} />
                                        <p className="text-gray-500 text-sm">לא נמצאו דפים תואמים לחיפוש.</p>
                                        <button 
                                            onClick={() => setModalTab('custom')}
                                            className="mt-4 text-indigo-600 text-sm font-bold hover:underline"
                                        >
                                            עבור ליצירה ידנית
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full p-4 md:p-6 overflow-y-auto">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">שם הפריט <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text"
                                        autoFocus
                                        className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white text-gray-900"
                                        placeholder="לדוגמה: ייעוץ עסקי / סדנת אפייה"
                                        value={customAssetForm.title}
                                        onChange={(e) => handleCustomFormChange('title', e.target.value)}
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">תיאור הפריט</label>
                                    <textarea 
                                        rows={3}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white text-gray-900 resize-none"
                                        placeholder="תאר את המוצר או השירות בקצרה..."
                                        value={customAssetForm.description}
                                        onChange={(e) => handleCustomFormChange('description', e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">מחיר (אופציונלי)</label>
                                    <input 
                                        type="text"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white text-gray-900"
                                        placeholder="לדוגמה: 100 ₪"
                                        value={customAssetForm.price}
                                        onChange={(e) => handleCustomFormChange('price', e.target.value)}
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">תמונות הפריט</label>
                                    <div className="flex flex-col gap-3">
                                        <div className="grid grid-cols-4 gap-2">
                                            {customAssetForm.images.map((img, idx) => (
                                                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                                                    <img src={img} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
                                                    <button 
                                                        onClick={() => removeImage(idx)}
                                                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition hover:bg-red-500"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                            <label className="cursor-pointer aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:bg-gray-50 flex flex-col items-center justify-center gap-1 transition text-gray-500 hover:text-indigo-600">
                                                <Upload size={20} />
                                                <span className="text-[10px] font-bold">הוסף</span>
                                                <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500">ניתן להעלות מספר תמונות. פורמטים נתמכים: JPG, PNG.</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">מידע נוסף ל-AI</label>
                                    <div className="relative">
                                        <textarea 
                                            rows={2}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white text-gray-900 resize-none pl-10"
                                            placeholder="האם יש משהו חשוב שה-AI צריך לדעת על הפריט הזה?"
                                            value={customAssetForm.aiInstructions}
                                            onChange={(e) => handleCustomFormChange('aiInstructions', e.target.value)}
                                        />
                                        <BrainCircuit className="absolute left-3 top-3 text-indigo-400" size={18} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 md:p-6 border-t border-gray-100 bg-white md:rounded-b-2xl flex justify-between items-center relative z-10">
                    {modalTab === 'search' ? (
                        <>
                            <div className="text-sm text-gray-500">
                                נבחרו <span className="font-bold text-indigo-600">{selectedSiteLinks.size}</span>
                            </div>
                            <button 
                                onClick={addSelectedAssetsFromModal}
                                disabled={selectedSiteLinks.size === 0}
                                className={`px-4 md:px-6 py-2.5 rounded-xl font-bold text-white transition shadow-lg flex items-center gap-2 text-sm md:text-base ${selectedSiteLinks.size > 0 ? 'bg-indigo-600 hover:bg-indigo-700 transform hover:scale-105' : 'bg-gray-300 cursor-not-allowed'}`}
                            >
                                <Plus size={18} /> הוסף <span className="hidden md:inline">פריטים</span>
                            </button>
                        </>
                    ) : (
                        <div className="flex justify-end w-full gap-3 items-center">
                            {customAssetSuccess && (
                                <span className="text-green-600 text-sm font-bold animate-fade-in flex items-center gap-1">
                                    <CheckCircle2 size={16} /> <span className="hidden md:inline">{editingAssetId ? "עודכן!" : "נוסף!"}</span>
                                </span>
                            )}
                            <button 
                                onClick={handleSaveCustomAsset}
                                disabled={!customAssetForm.title.trim()}
                                className={`px-4 md:px-8 py-2.5 rounded-xl font-bold text-white transition shadow-lg flex items-center gap-2 text-sm md:text-base ${customAssetForm.title.trim() ? 'bg-indigo-600 hover:bg-indigo-700 transform hover:scale-105' : 'bg-gray-300 cursor-not-allowed'}`}
                            >
                                {editingAssetId ? <Check size={18} /> : <Plus size={18} />}
                                {editingAssetId ? "עדכן" : "הוסף"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );

  return (
    <div dir="rtl" className="font-sans">
      {viewMode === 'landing' && renderLanding()}
      {viewMode === 'analyzing' && renderAnalyzing()}
      {viewMode === 'wizard' && renderWizard()}
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<WebsiteAnalyzer />);
}