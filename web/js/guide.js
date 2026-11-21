import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { esc } from './util.js';

/* ============================================================
   Rehber: kısa kullanım rehberi ve aranabilir terim sözlüğü
   ============================================================ */
const GUIDE = [
  ['Tarama', `Ana sayfa. En üstteki <b>Bugün</b> kartları açık sinyalleri, portföyünüzü, izleme listesindeki en büyük hareketleri ve
    14 gün içindeki temettüleri özetler. Hazır taramalar gruplara ayrılmıştır: <b>Tümü</b>, <b>İzleme listem</b> ve <b>Aktif sinyal</b> tek dokunuş;
    <b>Teknik</b>, <b>Temettü</b>, <b>Temel</b> başlıklarına dokununca altında o grubun taramaları açılır; seçili tarama başlıkta yazar.
    <b>Kayıtlı</b> başlığı kendi taramalarınızı ve "Bu taramayı kaydet" düğmesini gösterir. Alttaki sekmeler (Fiyat, Trend, Momentum, Temettü, Temel)
    tablonun sütun grubunu değiştirir. <b>+ Filtre</b> ile kendi koşulunuzu ekleyin (yüzde alanlara yüzde yazın: 5 = %5). Endeks, pazar ve sektörde birden
    fazla seçim yapılabilir. Her sekmede yalnızca temel sütunlar açık gelir; <b>☰ Görünüm</b> panelinde sekmeye ait diğer sütunlar "eklenebilir" başlığı altındadır. Bu panelde sütun ekleyip çıkarın ve tedbirli hisseleri gizleyin; masaüstünde sütun başlığını sürükleyerek,
    telefonda paneldeki oklarla sırasını değiştirin. Başlığa dokununca sıralanır. Endeks sütununda 30 / 50 / 100 / TÜM yazar; pazar yalnızca Yıldız ve Ana
    dışındaysa görünür.`],
  ['Hisse sayfası', `Tablodaki satıra dokunun. Grafikte dönem ve ölçek (doğrusal / log / %) seçilir; <b>Göstergeler</b> menüsünden ortalamalar,
    Bollinger, Ichimoku, destek/direnç ve alt paneller (RSI, MACD…) açılır. Açık göstergeler menünün yanında etiket olarak durur; × ile kapanır.
    Fareyle ya da iki parmakla yakınlaştırıp kaydırabilir, ⤢ ile tam ekran yapabilirsiniz. Grafiğin altındaki sekmeler: <b>Genel</b> (getiriler,
    teknik görünüm), <b>Destek / direnç</b>, <b>Temettü</b> (geçmiş, güvenlik skoru, verim bandı, F-skoru), <b>Temel ve değerleme</b> (oranlar,
    mali tablolar, DCF) ve <b>Sektör</b>. Verisi olmayan bölümler gösterilmez. ★ hisseyi izleme listesine ekler. "ⓘ" satırları açıklamaları açar.`],
  ['Sinyaller', `Birden fazla strateji aynı motorla çalışır ve gruplar (ör. Mum formasyonları) altında toplanır. Üstteki <b>Tüm stratejiler</b>
    seçiliyken bütün açık sinyaller tek tabloda (Strateji sütunuyla) ve en altta stratejilerin karşılaştırma tablosu görünür; bir grup başlığına dokunup
    stratejiyi seçince yalnızca onun sinyalleri, kuralları ve geriye dönük testi açılır. "Deneme" etiketli stratejilerin kuralları değişebilir.
    Satırdaki <b>1G / 4S</b> etiketi sinyalin günlük mi 4 saatlik mumda mı oluştuğunu gösterir. Açık sinyali olan hissenin grafiğinde giriş ve stop çizilir.
    <b>Hazırlanan kurulumlar</b>, bir sonraki mumda tamamlanabilecek hisseleri tetik fiyatıyla gösterir. Şu an: <b>Morning star</b> (sert kırmızı mum, doji,
    1. mumun tepesinin üstünde kapanan yeşil mum; üstte doldurulmamış düşüş FVG'si varsa sinyal yok; +1R'den sonra takip eden stop) ve deneme aşamasında <b>Donchian kırılımı</b> (yükseliş trendinde 20 günlük zirvenin kırılımı, yalnızca günlük; kapanış son 10 günün en düşüğünün altına inince çıkış). Test tablosunda sonuçları BIST 30 / 50 / 100 / TÜM ayrımıyla karşılaştırın.`],

  ['Karşılaştır', `En fazla 5 hisseyi ve BIST 100'ü aynı başlangıçtan (%0) itibaren getiri olarak üst üste çizer.`],
  ['Portföy', `<b>+ Varlık ekle</b> ile hisse (Temettü ya da Trend/Momentum), emtia/döviz ya da kripto ekleyin. Her varlık bir işlem
    listesidir: alım ve satımlar ortalama maliyet yöntemiyle hesaplanır. Alımı TL bakiyesinden ödeyebilir, satış gelirini TL bakiyesine
    aktarabilirsiniz; bu iki kayıt birbirine bağlıdır ve birlikte silinir. BTC/ETH/SOL/BNB USDT ya da USDC ile alınır.
    Hisselerinize temettü ödendiğinde portföy sayfası sorar; tutarı onaylayınca kayda geçer.`],
  ['Verilerinizi korumak', `Portföy ve listeler yalnızca bu cihazın tarayıcısında saklanır. Sağ üstteki <b>⚙</b> (Aktar) sayfasında üç yol var:
    <b>Yedek dosyası</b> (düzenli indirin, gerekince geri yükleyin), <b>bulut senkronizasyonu</b> (kendi özel GitHub Gist'iniz; cihazlar
    otomatik eşitlenir) ve tek seferlik taşıma için <b>Aktar kodu</b>. Tarayıcı verisini temizlemek ya da uygulamayı silmek
    yedeksiz verileri siler.`],
  ['Güncelleme', `Fiyatlar hafta içi seans boyunca yaklaşık saatte bir (GitHub'ın izin verdiği sıklıkta) güncellenir ve gecikmelidir;
    üst çubuktaki <b>Veri</b> rozeti son kapanış tarihini gösterir (veri eskiyse sarıya döner; dokununca ayrıntı çıkar). Uygulamanın yeni sürümü gelince altta "Yeni sürüm hazır" çıkar; Yenile'ye basmanız yeterli.`],
];

// [terim, açıklama, grup]
const TERMS = [
  // Piyasa
  ['BIST 30 / 50 / 100 / TÜM', 'Borsa İstanbul endeksleri. Endeks sütunu hissenin girdiği en dar endeksi gösterir (BIST 30 hissesi aynı zamanda 50 ve 100\'dedir).', 'Piyasa'],
  ['Yıldız / Ana / Alt Pazar', 'Borsa İstanbul pay piyasası bölümleri; halka açık piyasa değeri ve halka açıklık oranına göre belirlenir. Yıldız en büyük şirketlerdir.', 'Piyasa'],
  ['YİP (Yakın İzleme Pazarı)', 'Mali durumu, işlem koşulları ya da bilgilendirme eksikliği nedeniyle yakından izlenen şirketlerin işlem gördüğü pazar. Daha yüksek risk taşır.', 'Piyasa'],
  ['Tedbir (⚠)', 'Borsa İstanbul\'un olağandışı fiyat/hacim hareketlerinde uyguladığı kısıtlamalar: brüt takas, tek fiyat, açığa satış ve kredili işlem yasağı, emir paketi vb. Simgeye dokununca ayrıntı ve bitiş tarihi görünür.', 'Piyasa'],
  ['Brüt takas', 'Gün içinde alınıp satılan payların netleştirilmeden takas edilmesi; aynı gün al-sat yapmayı pahalılaştırır.', 'Piyasa'],
  ['Tek fiyat', 'Hissenin sürekli işlem yerine gün içinde belirli seanslarda tek fiyattan işlem görmesi.', 'Piyasa'],
  ['Gecikmeli veri', 'Ücretsiz kaynaklardan alınan fiyatlar anlık değildir (genellikle 15+ dk gecikmeli, güncelleme saatine bağlı).', 'Piyasa'],
  ['Halka açıklık', 'Payların borsada serbestçe işlem gören kısmının oranı.', 'Piyasa'],
  ['İşlem hacmi', 'Son 20 günün ortalama günlük işlem tutarı (TL). Likiditenin ölçüsüdür; düşük hacimli hisselerde alım-satım fiyatı sapabilir.', 'Piyasa'],

  // Fiyat ve risk
  ['Gün / 1H / 1A / 3A / 6A / 1Y / YB', 'Fiyat değişimi: günlük, 1 hafta, 1 ay, 3 ay, 6 ay, 1 yıl ve yılbaşından beri.', 'Fiyat ve risk'],
  ['52H zirve / dip', 'Son 52 haftanın en yüksek ve en düşük fiyatı; sütun güncel fiyatın bunlara uzaklığını gösterir.', 'Fiyat ve risk'],
  ['Göreli güç (RS)', 'Hissenin getirisi eksi BIST 100 getirisi. Pozitifse endeksten iyi gitmiştir.', 'Fiyat ve risk'],
  ['Volatilite', 'Günlük getirilerin standart sapmasının yıllıklandırılmış hâli (son 3 ay). Yüksekse fiyat sert dalgalanır.', 'Fiyat ve risk'],
  ['Beta', 'Hissenin BIST 100\'e duyarlılığı (son 1 yıl). 1,5 = endeks %1 oynayınca ortalama %1,5 oynar.', 'Fiyat ve risk'],
  ['Hacim/Ort.', 'Son gün hacmi / önceki 20 günün ortalaması. 2 ve üzeri "hacim patlaması" sayılır.', 'Fiyat ve risk'],
  ['Logaritmik ölçek', 'Grafikte eşit yüzde değişimleri eşit yükseklikte gösterir; uzun dönemde ve çok yükselmiş hisselerde daha doğru görünüm verir.', 'Fiyat ve risk'],

  // Teknik
  ['SMA (basit hareketli ortalama)', 'Son N günün kapanış ortalaması. SMA20 kısa, SMA50 orta, SMA200 uzun vadeli eğilimi gösterir.', 'Teknik'],
  ['EMA (üssel hareketli ortalama)', 'Son günlere daha çok ağırlık veren ortalama; SMA\'dan hızlı tepki verir. MACD bunun üzerine kuruludur.', 'Teknik'],
  ['VWMA', 'Hacim ağırlıklı hareketli ortalama: yüksek hacimli günler daha çok sayılır.', 'Teknik'],
  ['Trend (↑ / ↓)', '↑: Fiyat > SMA50 > SMA200 (güçlü yükseliş düzeni). ↓: tersi.', 'Teknik'],
  ['Golden / Death cross', 'SMA50\'nin SMA200\'ü yukarı (golden) ya da aşağı (death) kesmesi; uzun vadeli eğilim dönüşü işareti.', 'Teknik'],
  ['RSI 14', 'Göreli Güç Endeksi (0–100). 70 üstü aşırı alım, 30 altı aşırı satım bölgesi sayılır; güçlü trendlerde uzun süre bu bölgelerde kalabilir.', 'Teknik'],
  ['Stokastik RSI', 'RSI\'nın kendi son 14 günlük aralığındaki konumu (0–100). RSI\'dan daha hassastır; 20 altı dip, 80 üstü tepe bölgesi.', 'Teknik'],
  ['MACD', 'EMA12 − EMA26 farkı ve onun 9 günlük ortalaması (sinyal). MACD sinyali yukarı keserse "al", aşağı keserse "sat" kesişimi. Histogram ikisinin farkıdır.', 'Teknik'],
  ['Fisher dönüşümü', 'Fiyatı normal dağılıma benzeten, dönüşleri keskin gösteren osilatör (9). Tetik çizgisini sıfırın altında yukarı kesmesi dipten dönüş sinyali sayılır.', 'Teknik'],
  ['Bollinger bantları', 'SMA20 ± 2 standart sapma. Bantların daralması sıkışmayı, fiyatın banda değmesi aşırı hareketi gösterir.', 'Teknik'],
  ['ATR', 'Ortalama Gerçek Aralık (14): günlük ortalama fiyat oynaklığı. ATR % = ATR / fiyat. Zarar-kes mesafesi belirlemede kullanılır.', 'Teknik'],
  ['Supertrend', 'ATR tabanlı (10, 3) iz süren çizgi. Fiyat üstündeyse yeşil (al), altındaysa kırmızı (sat); renk dönüşü trend değişimi işaretidir.', 'Teknik'],
  ['Ichimoku bulutu', 'Tenkan (9), Kijun (26) ve iki öncü çizgiden (Senkou A/B) oluşan sistem. Fiyat bulutun üstündeyse yükseliş, altındaysa düşüş eğilimi; bulut kalınlığı destek/direnç gücüdür. Tenkan/Kijun kesişimi kısa vadeli sinyaldir.', 'Teknik'],

  // Destek/direnç
  ['Destek / direnç', 'Fiyatın geçmişte durduğu, dönüş yaptığı seviyeler. Destek altta (alıcıların güçlü olduğu), direnç üstte (satıcıların güçlü olduğu) bölgedir.', 'Destek ve direnç'],
  ['Confluence (kesişim)', 'Farklı yöntemlerle bulunan seviyelerin aynı fiyat bölgesinde toplanması. Ne kadar çok yöntem aynı yeri gösteriyorsa bölge o kadar güçlüdür. Adaylar 0,5 × ATR içinde birleştirilir.', 'Destek ve direnç'],
  ['Skor', 'Bölgedeki seviyelerin ağırlıklı toplamı (yıllık > çeyreklik > aylık > haftalık; hacim profili ve 52H uçları yüksek ağırlıklı). 10 ve üzeri "güçlü" sayılır.', 'Destek ve direnç'],
  ['Kesişim sayısı', 'Bölgeyi oluşturan birbirinden farklı yöntem sayısı.', 'Destek ve direnç'],
  ['Haftalık/aylık/yıllık H, L, EQ', 'Önceki tamamlanmış dönemin en yüksek (High), en düşük (Low) ve ortası (EQ = denge). Açılış (Open) içinde bulunulan dönemin açılış fiyatıdır.', 'Destek ve direnç'],
  ['Hacim profili (POC, VAH, VAL)', 'Son dönemde en çok işlemin yapıldığı fiyat (POC) ve hacmin %70\'inin geçtiği değer alanının üst (VAH) ve alt (VAL) sınırı.', 'Destek ve direnç'],
  ['Swing tepe / dip', 'Fiyatın iki yanındaki mumlardan yüksek (tepe) ya da düşük (dip) kaldığı dönüş noktaları.', 'Destek ve direnç'],
  ['Pivot (PP, S1, R1)', 'Önceki ayın yüksek, düşük ve kapanışından hesaplanan klasik pivot seviyeleri.', 'Destek ve direnç'],
  ['Boşluk (gap)', 'Bir günün aralığının öncekiyle hiç kesişmediği, henüz doldurulmamış fiyat boşluğu.', 'Destek ve direnç'],
  ['Yuvarlak sayı', '10, 50, 100 gibi psikolojik seviyeler (zayıf ağırlıklı).', 'Destek ve direnç'],

  // Temel
  ['F/K (fiyat/kazanç)', 'Piyasa değeri / son 12 ay net kâr. Kaç yıllık kârla şirketin değerinin geri ödeneceğini gösterir; düşükse ucuz sayılır. Zarar edenlerde boş.', 'Temel'],
  ['PD/DD', 'Piyasa değeri / defter (özkaynak) değeri. 1\'in altı şirketin özkaynağından ucuza fiyatlandığını gösterir.', 'Temel'],
  ['FD/FAVÖK', '(Piyasa değeri + net borç) / son 12 ay FAVÖK. Borç yapısından bağımsız değerleme ölçüsü. Bankalarda anlamlı değildir.', 'Temel'],
  ['FAVÖK', 'Faiz, amortisman ve vergi öncesi kâr: ana faaliyetten elde edilen nakit kârın yaklaşık ölçüsü.', 'Temel'],
  ['Net borç', 'Finansal borçlar − nakit ve benzerleri. Negatifse şirketin net nakdi vardır.', 'Temel'],
  ['Net marj / Faaliyet marjı', 'Net kâr / satışlar ve esas faaliyet kârı / satışlar.', 'Temel'],
  ['ÖK kârlılığı (ROE)', 'Son 12 ay net kâr / özkaynak. Şirketin ortak sermayesiyle ne kadar kâr ürettiği.', 'Temel'],
  ['Borç/ÖK', 'Toplam finansal borç / özkaynak. Yüksekse şirket borçla büyüyor demektir.', 'Temel'],
  ['Satış / kâr büyümesi', 'Yılbaşından bu yana, geçen yılın aynı dönemine göre değişim.', 'Temel'],
  ['Son 12 ay (TTM)', 'Son dört çeyreğin toplamı. Oranlar bununla hesaplanır.', 'Temel'],
  ['Enflasyon muhasebesi (TMS 29)', '2023\'ten beri mali tablolar enflasyona göre düzeltilir; son 12 ay toplamları farklı satın alma gücündeki dönemleri birleştirdiği için oranlar yaklaşıktır.', 'Temel'],
  ['Piyasa değeri', 'Pay sayısı × fiyat.', 'Temel'],

  // Temettü
  ['Temettü verimi', 'Yıl içinde ödenen hisse başı brüt temettü toplamı / güncel fiyat. Takvim yılı esas alınır (bu yıl ve geçen yıl ayrı).', 'Temettü'],
  ['Temettü güvenlik skoru', '0–100 arası; temettünün sürdürülebilirliğini ölçer. Bileşenler: dağıtma oranı (20), serbest nakit akışının temettüyü karşılaması (20), net borç/FAVÖK (15), süreklilik (15), son 3 yıldaki kesintiler (10), özkaynak kârlılığı (10), F-skoru (10). Uygulanamayan bileşenler (bankalarda nakit akışı, borç, F-skoru) dışarıda bırakılıp puan 100\'e ölçeklenir. 70+ güçlü, 50–70 orta, 50 altı zayıf.', 'Temettü'],
  ['Verim bandı', 'Hissenin piyasaya göre veriminin (son 12 ay verimi / temettü ödeyen hisselerin medyan verimi) kendi son 4 yıllık geçmişindeki yüzdelik dilimi. %90: hisse, piyasaya göre geçmişte günlerin %90\'ından daha yüksek verimli, yani temettüsüne göre piyasadan her zamankinden ucuz. Piyasa genelindeki verim değişimi ayıklandığı için hisseler arasında seçicidir; hisse sayfasında mutlak dilim ve piyasa verimi de görünür. Temettü kesilecekse yanıltıcıdır; güvenlik skoruyla birlikte okunmalı.', 'Temettü'],
  ['Serbest nakit akışı', 'Faaliyetlerden elde edilen nakit eksi yatırım harcamaları. Temettünün kâğıt üzerindeki kârdan değil, gerçek nakitten ödenip ödenemeyeceğini gösterir.', 'Temel'],
  ['DCF (indirgenmiş nakit akışı)', 'Şirketin gelecekteki serbest nakit akışlarının bugünkü değeri. Burada dolar bazında hesaplanır: nakit akışları dolara çevrilir, ABD 10 yıllık faiz + beta × piyasa risk primi + ülke risk primiyle indirgenir; net borç ve azınlık payları düşülür. Banka, sigorta, GYO ve holdinglere uygulanmaz. Sonuç varsayımlara çok duyarlıdır.', 'Temel'],
  ['İma edilen büyüme (ters DCF)', 'Bugünkü fiyatın doğru olması için şirketin serbest nakit akışının dolar bazında ne kadar büyümesi gerektiği. Tek bir eder fiyattan daha sağlamdır: tahmin yapmak yerine "piyasanın beklentisi makul mü?" sorusunu sordurur. Düşük (ör. %0–2) ise fiyat mütevazı, yüksek (ör. %20+) ise iddialı bir beklenti içerir.', 'Temel'],
  ['Piotroski F-skoru', '0–9 arası finansal sağlık puanı. Kârlılık (varlık kârlılığı > 0, faaliyet nakit akışı > 0, varlık kârlılığı arttı, nakit akışı > net kâr), borçluluk ve likidite (uzun vadeli borç oranı azaldı, cari oran arttı, bedelli sermaye artırımı yok) ve verimlilik (brüt marj arttı, varlık devir hızı arttı) kriterlerinin her biri 1 puan. 7+ güçlü, 3 ve altı zayıf.', 'Temel'],
  ['Bağıl verim', 'Temettü / önceki temettünün hak kullanım gününden bu temettüye kadarki günlük kapanışların ortalaması (öncesinde temettü yoksa son 1 yıl). Tek bir günün fiyatına bağlı kalmadan, o temettüyü "kazanan" dönemdeki tipik alış fiyatına göre verimi gösterir. Yıllık değer, yıl içindeki ödemelerin toplamıdır.', 'Temettü'],
  ['Hak kullanım tarihi (ex-date)', 'Temettünün fiyattan düşüldüğü gün. Temettü almak için hisseyi bu günden ÖNCEKİ işlem günü kapanışında elde tutmak gerekir.', 'Temettü'],
  ['Brüt / net temettü', 'Brüt: şirketin açıkladığı tutar. Net: stopaj düşüldükten sonra hesaba geçen tutar.', 'Temettü'],
  ['Stopaj', 'Temettüden kesilen vergi; bireysel yatırımcı için genellikle %15. GYO\'larda ve bazı şirketlerde %0 olabilir.', 'Temettü'],
  ['Dağıtma oranı (payout)', 'Ödenen temettü / net kâr. Çok yüksekse temettünün sürdürülebilirliği sorgulanmalı.', 'Temettü'],
  ['Kesintisiz / Son 5 yıl', 'Kaç yıldır her yıl temettü ödendiği ve son 5 takvim yılının kaçında ödendiği.', 'Temettü'],
  ['5Y ort. verim', 'Son 5 tamamlanmış yılın ortalama yıllık temettüsü / güncel fiyat.', 'Temettü'],
  ['Sıradaki temettü', 'Açıklanmış, henüz ödenmemiş temettü (net tutar ve tarih); kaynak temettuhisseleri.com.', 'Temettü'],

  ['R (risk birimi)', 'Bir işlemde göze alınan kayıp: giriş fiyatı − stop. Sonuçlar R cinsinden verilir; +2R riske edilenin iki katı kazanç, −1R stop olmak demektir. Pozisyon büyüklüğü 1R kaybı göze alınabilecek tutara göre belirlenir.', 'Sinyaller'],
  ['Kurulum (setup)', 'Giriş koşulu, stop ve hedefi önceden tanımlı işlem kuralı.', 'Sinyaller'],
  ['FVG (fair value gap, fiyat boşluğu)', 'Üç mumluk dizide 1. ve 3. mumun fiyat aralıklarının çakışmadığı, arada işlem görmemiş bölge. Düşüş FVG\'si: 3. mumun en yükseği 1. mumun en düşüğünün altında. Fiyat sonradan boşluğun üst sınırına ulaşmadıysa boşluk doldurulmamış sayılır ve çoğu zaman direnç gibi davranır.', 'Sinyaller'],
  ['Donchian kanalı', 'Son N günün en yüksek ve en düşük fiyatı arasındaki bant. Kapanışın üst bandın (ör. 20 günlük zirve) üstüne çıkması kırılım sayılır; trend takip sistemlerinin en eski ve en çok test edilen girişidir.', 'Sinyaller'],
  ['Kanal çıkışı', 'Kırılım işlemlerinde kullanılan çıkış: kapanış son 10 günün en düşüğünün altına inince pozisyon kapatılır. Trend sürdükçe pozisyonu taşır, dönüşte kârın bir kısmını geri verir. Başlangıç stopu her zaman geçerlidir.', 'Sinyaller'],
  ['Strateji grubu', 'Sinyal sayfasında benzer mantıktaki stratejilerin toplandığı başlık: mum formasyonları, trend takip, kırılım, ortalamaya dönüş.', 'Sinyaller'],
  ['Morning star (sabah yıldızı)', 'Üç mumluk dönüş formasyonu: sert bir kırmızı mum, ardından kararsızlığı gösteren küçük gövdeli bir mum (doji) ve satıcıların başladığı yerin üstüne çıkan güçlü bir yeşil mum. Düşüşün tükendiğine ve alıcıların kontrolü aldığına işaret eder.', 'Sinyaller'],
  ['Geriye dönük test', 'Kuralların geçmiş veride, yalnızca o güne kadar bilinen bilgiyle uygulanması. Burada giriş ertesi gün açılışta yapılır, aynı gün stop ve hedef görülürse stop sayılır, komisyon ve kayma düşülür.', 'Sinyaller'],
  ['Takip eden stop (trailing stop)', 'Fiyat yükseldikçe yukarı taşınan, hiç aşağı inmeyen stop. Burada fiyat +1R kâra ulaşınca devreye girer ve o güne kadar görülen en yüksek fiyatın 1R altında durur; böylece trend sürdükçe pozisyon taşınır, dönüşte kârın bir kısmı korunur.', 'Sinyaller'],
  ['Kâr faktörü', 'Kazanan işlemlerin toplam kazancı / kaybeden işlemlerin toplam kaybı. 1\'in üstü kârlı; 1,2–1,5 gerçekçi bir sistem için iyi sayılır.', 'Sinyaller'],
  // Portföy
  ['Ortalama maliyet', 'Elde kalan payların birim maliyeti: tüm alımların (komisyon dahil) toplamı / adet. Satışlar ortalamayı değiştirmez.', 'Portföy'],
  ['Gerçekleşen K/Z', 'Satışlarda elde edilen kâr/zarar: (satış fiyatı − ortalama maliyet) × adet − komisyon.', 'Portföy'],
  ['Gerçekleşmemiş K/Z', 'Elde tutulan payların güncel değeri − maliyeti.', 'Portföy'],
  ['Net yatırılan', 'Portföye dışarıdan giren para eksi dışarı çıkan para. TL bakiyesi üzerinden yapılan iç alım-satımlar ve temettüler sayılmaz.', 'Portföy'],
  ['Toplam getiri', 'Güncel değer − net yatırılan. Gerçekleşen ve gerçekleşmemiş K/Z ile alınan temettüleri birlikte gösterir.', 'Portföy'],
  ['TL bakiyesi (cüzdan)', 'Emtia/İtibari\'deki "Türk lirası" kaydı. Satış gelirleri buraya aktarılabilir, alımlar buradan ödenebilir. USDT ve USDC de kripto alımları için cüzdan görevi görür.', 'Portföy'],
  ['Bağlı işlem', 'Bir alım cüzdandan ödendiğinde ya da satış geliri cüzdana aktarıldığında cüzdanda otomatik oluşan karşılık kaydı; asıl işlem silinince o da silinir.', 'Portföy'],
  ['Çıkış sinyali / Dikkat', 'Trend/Momentum hisselerinde güçlü (Supertrend sat, MACD sat, düşüş düzeni) ve zayıf (Fisher sat, SMA20 altı, RSI aşırı alım…) satış uyarıları.', 'Portföy'],
  ['Stablecoin (USDT, USDC)', 'Değeri 1 ABD dolarına sabitlenmiş kripto paralar. TL karşılığı dolar kuruyla birlikte değişir.', 'Portföy'],
];

const norm = s => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const compact = s => s.replace(/[^a-z0-9]/g, '');
// Aksan, büyük/küçük harf ve noktalama duyarsız ("fk" → F/K, "ozkaynak" → özkaynak)
export const termMatches = (q, t) => {
  const n = norm(q.trim()), text = norm(t[0] + ' ' + t[1]);
  return !n || text.includes(n) || (compact(n).length > 1 && compact(norm(t[0])).includes(compact(n)));
};

export function renderGuide() {
  destroyCharts();
  document.title = 'Rehber · Tahta';
  const groups = [...new Set(TERMS.map(t => t[2]))];
  view.innerHTML = `
  <section class="dhead"><div><h1>Rehber</h1><p class="sub">Kısa kullanım rehberi ve terim sözlüğü</p></div></section>
  <div class="guide">
    <section class="panel guide-how">
      <h2>Nasıl kullanılır?</h2>
      ${GUIDE.map(([h, t], i) => `<details${i === 0 ? ' open' : ''}><summary>${h}</summary><p>${t}</p></details>`).join('')}
    </section>
    <section class="panel glossary">
      <h2>Terim sözlüğü</h2>
      <label class="sr" for="termQ">Terim ara</label>
      <input id="termQ" type="search" placeholder="Terim ara, ör. F/K, RSI, stopaj" autocomplete="off">
      <nav class="gloss-groups" aria-label="Gruplar">${groups.map((g, i) => `<button type="button" class="gchip" data-gjump="${i}">${g}</button>`).join('')}</nav>
      ${groups.map((g, i) => `<div class="gloss-group" data-g="${i}"><h3>${g}</h3><dl>${
        TERMS.filter(t => t[2] === g).map(t => `<div class="term"><dt>${esc(t[0])}</dt><dd>${esc(t[1])}</dd></div>`).join('')}</dl></div>`).join('')}
      <p class="empty" id="termNone" hidden>Eşleşen terim yok.</p>
      <p class="muted" style="font-size:12px">Masaüstünde tablo başlıklarının üzerine gelince de kısa açıklamalar görünür. Yatırım tavsiyesi değildir.</p>
    </section>
  </div>`;
  view.querySelector('.gloss-groups').addEventListener('click', e => {
    const b = e.target.closest('[data-gjump]');
    if (b) view.querySelector(`.gloss-group[data-g="${b.dataset.gjump}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const q = view.querySelector('#termQ');
  q.addEventListener('input', () => {
    let any = false;
    view.querySelectorAll('.gloss-group').forEach(g => {
      let n = 0;
      g.querySelectorAll('.term').forEach(el => {
        const hit = termMatches(q.value, [el.querySelector('dt').textContent, el.querySelector('dd').textContent]);
        el.hidden = !hit; n += hit;
      });
      g.hidden = !n; any ||= n > 0;
    });
    view.querySelector('#termNone').hidden = any;
    view.querySelector('.gloss-groups').hidden = !!q.value.trim();
  });
}
export { TERMS };
