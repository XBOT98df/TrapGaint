import React, { useState, useEffect } from 'react';

interface Skin {
  id: string;
  name: string;
  author: string;
  downloads: number;
  likes: number;
  imageUrl: string;
  renderUrl: string;
  downloadUrl: string;
  tags: string[];
  model: 'steve' | 'alex';
  uuid?: string; // For NameMC integration
}

interface SkinGalleryProps {
  onSkinSelect: (skin: Skin) => void;
  onRemoveSkin?: () => Promise<void> | void;
  selectedSkin?: Skin | null;
  selectedSkinUsername?: string | null;
  currentPage?: number;
}

export const SkinGallery: React.FC<SkinGalleryProps> = ({
  onSkinSelect,
  onRemoveSkin,
  selectedSkin,
  selectedSkinUsername,
  currentPage = 0,
}) => {
  const [skins, setSkins] = useState<Skin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkinId, setSelectedSkinId] = useState<string | null>(null);

  const extractSkinUsername = (skin: Skin): string => {
    try {
      const raw = typeof skin.downloadUrl === 'string' ? skin.downloadUrl.split('/').pop() || '' : '';
      return decodeURIComponent(raw).trim();
    } catch {
      return '';
    }
  };

  // Fetch skins from NameMC API
  const fetchSkinsFromNameMC = async (page: number = 0) => {
    try {
      setLoading(true);
      
      // Generate all skins once (not per page)
      if (skins.length === 0) {
        const mockSkinsData = generateMockSkins(0);
        setSkins(mockSkinsData);
      }
      
    } catch (error) {
      console.error('Failed to fetch skins from NameMC:', error);
      // Fallback to mock data
      const mockSkinsData = generateMockSkins(0);
      setSkins(mockSkinsData);
    } finally {
      setLoading(false);
    }
  };

  // Generate mock skins with realistic data structure for NameMC integration
  const generateMockSkins = (page: number): Skin[] => {
    const allUsernames = [
      // Page 0 - Popular YouTubers/Streamers
      'Dream', 'GeorgeNotFound', 'Sapnap', 'BadBoyHalo', 'Skeppy', 'TommyInnit', 
      'Tubbo', 'Ranboo', 'Philza', 'Wilbur', 'Technoblade', 'Nihachu',
      'JackManifoldTV', 'Foolish', 'Punz', 'Awesamdude', 'Callahan', 'Eret',
      'Fundy', 'HBomb94', 'JSchlatt', 'KarlJacobs', 'Quackity', 'ConnorEatsPants',
      'CaptainPuffy', 'Antfrost', 'Seapeekay', 'Michaelmcchill', 'Vikkstar123', 'Lazar',
      'Fresh', 'Mully', 'JoshDub', 'YourNarrator', 'EddieVR', 'Juicy',
      'Smii7y', 'Kryoz', 'BigJigglyPanda', 'Terroriser', 'Vanoss', 'Delirious',
      'Basically', 'Wildcat', 'Nogla', 'Moo', 'Panda', 'Ohm',
      'Cartoonz', 'Squirrel',
      
      // Page 1 - Hermitcraft Members
      'Grian', 'Mumbo', 'Iskall85', 'GoodTimesWithScar', 'BdoubleO100', 'Keralis',
      'Xisuma', 'TangoTek', 'ImpulseSV', 'ZombieCleo', 'Rendog', 'FalseSymmetry',
      'StressMonster101', 'VintageBeef', 'EthosLab', 'DocM77', 'Hypixel', 'Welsknight',
      'JoeHills', 'XBCrafted', 'iJevin', 'Cubfan135', 'PearlescentMoon', 'GeminiTay',
      'Zedaph', 'Tinfoilchef', 'Biffa2001', 'Sl1pg8r', 'Zueljin', 'Jessassin',
      'Monkeyfarm', 'Pungence', 'Generikb', 'Anderzel', 'Arkas', 'Aureylian',
      'BlameTC', 'Baj', 'Dmac', 'Guude', 'JSano', 'Kurtjmac',
      'Mhykol', 'Millbee', 'Nebris', 'OldManWillakers', 'Pakratt', 'PauseUnpause',
      'Pyro', 'Shree', 'Vechs', 'W92Baj',
      
      // Page 2 - Classic Minecraft YouTubers
      'DanTDM', 'PopularMMOs', 'Stampy', 'iBallisticSquid', 'AntVenom', 'SethBling',
      'CaptainSparklez', 'SkyDoesMinecraft', 'JeromeASF', 'BajanCanadian', 'ASFJerome',
      'MinecraftUniverse', 'Ssundee', 'Crainer', 'Lanceypooh', 'PrestonPlayz',
      'MrWoofless', 'Lachlan', 'Vikkstar', 'Craftbattleduty', 'NoahCraftFTW',
      'TBNRfrags', 'Woofless', 'xRpMx13', 'Graser10', 'Straub', 'Kiingtong',
      'Tofuu', 'UnspeakableGaming', 'MooseCraft', 'Shark', 'Favremysabre',
      'RyguyRocky', 'Thinknoodles', 'JellyBean', 'Slogo', 'Kwebbelkop',
      'Jelly', 'Slogoman', 'Aphmau', 'LDShadowLady', 'Yammy', 'GloomyKassie',
      'Stacy', 'Joey', 'Daniel', 'Lizzie', 'Joel', 'Smallishbeans',
      'InTheLittleWood', 'Solidarity', 'Shubble', 'Smajor1995', 'fWhip',
      
      // Page 3 - Speedrunners & PvP Players
      'Illumina', 'Fruitberries', 'TapL', 'Krtzyy', 'Seapeekay', 'HBomb94',
      'Ph1LzA', 'Wisp', 'Boosfer', 'YellowWool', 'Kier', 'Dev', 'Baablu',
      'Silverr', 'Couriway', 'Feinberg', 'Dylqn', 'Benex', 'Cscuile',
      'Cube1337x', 'ElAnalistaDeBits', 'Forsen', 'xQc', 'Mizkif', 'Sodapoppin',
      'Asmongold', 'HasanAbi', 'Ludwig', 'Pokimane', 'Valkyrae', 'Sykkuno',
      'Corpse', 'Toast', 'Scarra', 'LilyPichu', 'Masayoshi', 'Yvonnie',
      'QuarterJade', 'BrookeAB', 'Fuslie', 'Kkatamina', 'Miyoung', 'Tina',
      'Jodi', 'Leslie', 'Janet', 'Aria', 'Wendy', 'Celine', 'Kris', 'John',
      'Peter', 'Ryan', 'Ellum', 'Five0', 'Edison', 'Wendy',
      
      // Page 4+ - Generated unique usernames
      'AlphaWolf', 'BetaShark', 'GammaRay', 'DeltaForce', 'EpsilonStar', 'ZetaWave',
      'EtaStorm', 'ThetaBlaze', 'IotaFrost', 'KappaFlame', 'LambdaVoid', 'MuCrystal',
      'NuShadow', 'XiLight', 'OmicronDark', 'PiCircle', 'RhoSpiral', 'SigmaCore',
      'TauEnergy', 'UpsilonBeam', 'PhiGold', 'ChiSilver', 'PsiBronze', 'OmegaEnd',
      
      // Page 5 - Gaming Legends
      'Notch', 'Herobrine', 'Steve', 'Alex', 'Enderman', 'Creeper',
      'Zombie', 'Skeleton', 'Spider', 'Witch', 'Villager', 'Piglin',
      'Blaze', 'Ghast', 'Wither', 'Dragon', 'Guardian', 'Shulker',
      'Phantom', 'Ravager', 'Pillager', 'Vindicator', 'Evoker', 'Vex',
      'Strider', 'Hoglin', 'Zoglin', 'Pigman', 'Magma', 'Slime',
      'Silverfish', 'Endermite', 'Bat', 'Squid', 'Dolphin', 'Turtle',
      'Panda', 'Polar', 'Wolf', 'Cat', 'Ocelot', 'Parrot',
      
      // Page 6 - Mythical Creatures
      'Phoenix', 'Griffin', 'Unicorn', 'Pegasus', 'Kraken', 'Leviathan',
      'Titan', 'Golem', 'Minotaur', 'Centaur', 'Sphinx', 'Chimera',
      'Hydra', 'Cerberus', 'Banshee', 'Valkyrie', 'Seraph', 'Cherub',
      'Demon', 'Angel', 'Fairy', 'Elf', 'Dwarf', 'Orc',
      'Troll', 'Goblin', 'Hobbit', 'Giant', 'Cyclops', 'Medusa',
      'Siren', 'Nymph', 'Dryad', 'Naiad', 'Salamander', 'Sylph',
      'Gnome', 'Pixie', 'Sprite', 'Wraith', 'Lich', 'Vampire',
      
      // Page 7 - Elements & Forces
      'Fire', 'Water', 'Earth', 'Air', 'Lightning', 'Ice',
      'Shadow', 'Light', 'Void', 'Chaos', 'Order', 'Time',
      'Space', 'Gravity', 'Energy', 'Matter', 'Spirit', 'Soul',
      'Mind', 'Body', 'Heart', 'Will', 'Power', 'Strength',
      'Speed', 'Agility', 'Wisdom', 'Intelligence', 'Courage', 'Honor',
      'Justice', 'Peace', 'War', 'Love', 'Hate', 'Hope',
      'Fear', 'Joy', 'Sorrow', 'Anger', 'Calm', 'Storm',
      
      // Page 8 - Colors & Gems
      'Ruby', 'Sapphire', 'Emerald', 'Diamond', 'Topaz', 'Amethyst',
      'Opal', 'Pearl', 'Jade', 'Onyx', 'Quartz', 'Garnet',
      'Crimson', 'Scarlet', 'Azure', 'Cobalt', 'Violet', 'Indigo',
      'Golden', 'Silver', 'Bronze', 'Copper', 'Platinum', 'Titanium',
      'Obsidian', 'Marble', 'Granite', 'Crystal', 'Prism', 'Spectrum',
      'Rainbow', 'Aurora', 'Nebula', 'Galaxy', 'Comet', 'Meteor',
      'Star', 'Moon', 'Sun', 'Eclipse', 'Dawn', 'Dusk',
      
      // Page 9 - Nature & Weather
      'Thunder', 'Lightning', 'Rain', 'Snow', 'Hail', 'Mist',
      'Fog', 'Cloud', 'Wind', 'Breeze', 'Gale', 'Hurricane',
      'Tornado', 'Cyclone', 'Blizzard', 'Avalanche', 'Earthquake', 'Volcano',
      'Ocean', 'River', 'Lake', 'Stream', 'Waterfall', 'Glacier',
      'Desert', 'Forest', 'Jungle', 'Mountain', 'Valley', 'Canyon',
      'Cave', 'Cavern', 'Cliff', 'Peak', 'Summit', 'Ridge',
      'Meadow', 'Prairie', 'Tundra', 'Savanna', 'Marsh', 'Swamp'
    ];

    const skinNames = [
      'Dragon Warrior', 'Crystal Mage', 'Shadow Assassin', 'Fire Elemental', 'Ice Queen',
      'Lightning Mage', 'Earth Guardian', 'Wind Walker', 'Ocean Master', 'Star Guardian',
      'Moon Priestess', 'Sun Knight', 'Dark Paladin', 'Light Cleric', 'Nature Druid',
      'Cyber Ninja', 'Space Explorer', 'Neon Samurai', 'Tech Warrior', 'Digital Ghost',
      'Quantum Soldier', 'Plasma Hunter', 'Void Walker', 'Circuit Breaker', 'Data Miner',
      'Hologram', 'Synthwave', 'Cyberpunk', 'Android', 'Cyborg',
      'Arctic Explorer', 'Desert Nomad', 'Forest Ranger', 'Mountain Climber', 'Cave Dweller',
      'Treasure Hunter', 'Jungle Explorer', 'Ocean Diver', 'Sky Pilot', 'Underground Miner',
      'Volcano Researcher', 'Storm Chaser', 'Time Traveler', 'Dimension Hopper', 'Portal Walker',
      'Steampunk Engineer', 'Mad Scientist', 'Royal Guard', 'Merchant', 'Blacksmith',
      'Alchemist', 'Librarian', 'Chef', 'Artist', 'Musician',
      'Architect', 'Inventor', 'Detective', 'Spy', 'Agent',
      'Phoenix Rider', 'Dragon Tamer', 'Unicorn Guardian', 'Griffin Master', 'Pegasus Knight',
      'Kraken Hunter', 'Leviathan Slayer', 'Titan Warrior', 'God Slayer', 'Demon Hunter',
      'Angel Warrior', 'Celestial Being', 'Cosmic Entity', 'Void Lord', 'Chaos Master'
    ];

    const authors = [
      'SkinMaster', 'TechCrafter', 'HistoryFan', 'CosmicBuilder', 'NatureLover',
      'SeaAdventurer', 'GearHead', 'IceWalker', 'SandDrifter', 'NeonBlade',
      'MysticCrafter', 'DarkBlade', 'FireForge', 'FrostBite', 'StormCaller',
      'RockSolid', 'WindDancer', 'WaveRider', 'StarGazer', 'MoonWalker',
      'SunShine', 'ShadowMaster', 'LightBringer', 'VoidCrawler', 'TimeBender'
    ];

    // Generate ALL skins for all pages (40 skins total for 10 pages)
    const totalSkins = 40;
    
    return Array.from({ length: totalSkins }, (_, i) => {
      const username = allUsernames[i] || `Player${i + 1}`;
      const skinNameIndex = i % skinNames.length;
      const authorIndex = i % authors.length;
      
      return {
        id: `skin-${i}-${username}`,
        name: skinNames[skinNameIndex],
        author: authors[authorIndex],
        downloads: Math.floor(Math.random() * 20000) + 1000 + (i * 50),
        likes: Math.floor(Math.random() * 1500) + 100 + (i * 10),
        imageUrl: `https://mc-heads.net/avatar/${username}/64`,
        renderUrl: `https://mc-heads.net/body/${username}/200`,
        downloadUrl: `https://mc-heads.net/skin/${username}`,
        tags: ['custom', 'gallery', skinNames[skinNameIndex].toLowerCase().replace(' ', '-')],
        model: (i % 3 === 0) ? 'alex' : 'steve',
        uuid: `${username}-${i}-unique`
      };
    });
  };

  useEffect(() => {
    fetchSkinsFromNameMC(currentPage);
  }, [currentPage]);

  useEffect(() => {
    const fallbackSelected = selectedSkin ? extractSkinUsername(selectedSkin) : '';
    const targetUsername = (selectedSkinUsername || fallbackSelected || '').trim();

    if (!targetUsername) {
      setSelectedSkinId(null);
      return;
    }

    const match = skins.find(
      (skin) => extractSkinUsername(skin).toLowerCase() === targetUsername.toLowerCase()
    );

    if (match) {
      setSelectedSkinId(match.id);
      return;
    }

    setSelectedSkinId(null);
  }, [skins, selectedSkinUsername, selectedSkin]);

  const filteredSkins = skins;

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center">
        <div className="text-white text-lg">Loading skins...</div>
      </div>
    );
  }

  // Show only 4 skins per page to match cape layout exactly
  const skinsPerPage = 4;
  const startIndex = currentPage * skinsPerPage;
  const pageSkins = filteredSkins.slice(startIndex, startIndex + skinsPerPage);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {pageSkins.map((skin) => (
          <div
            key={skin.id}
            onClick={async () => {
              setSelectedSkinId(skin.id);
              onSkinSelect(skin);
              
              // Auto-apply skin immediately (similar to cape behavior)
              if ((window as any).handleApplySkin) {
                await (window as any).handleApplySkin(skin);
              }
            }}
            className={`bg-zinc-900 rounded-lg p-4 cursor-pointer transition-all hover:bg-zinc-800 relative ${
              selectedSkinId === skin.id ? 'ring-2 ring-white' : 'ring-2 ring-transparent'
            }`}
          >
            {/* White border overlay when selected - only on edges, not covering content */}
            {selectedSkinId === skin.id && (
              <div className="absolute inset-0 rounded-lg pointer-events-none border-4 border-white" />
            )}
            
            {/* Skin Preview */}
            <div className="h-48 bg-zinc-800 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
              <img
                src={skin.renderUrl}
                alt={skin.name}
                className="w-full h-full object-contain"
                style={{ imageRendering: 'pixelated' }}
                onError={(e) => {
                  // Fallback to face avatar if body render fails
                  (e.target as HTMLImageElement).src = skin.imageUrl;
                }}
              />
            </div>
          </div>
        ))}
        
        {/* Show message when no skins available */}
        {pageSkins.length === 0 && (
          <div className="col-span-full text-center py-8">
            <p className="text-zinc-400">No skins available on this page</p>
            <p className="text-zinc-500 text-sm mt-2">Try going to a different page</p>
          </div>
        )}
      </div>
      
      {/* Remove Skin Option - only show on first page */}
      {currentPage === 0 && (
        <div className="mt-2">
          <button
            onClick={async () => {
              setSelectedSkinId(null);
              if (onRemoveSkin) {
                try {
                  await onRemoveSkin();
                } catch (error) {
                  console.error('Failed to remove skin:', error);
                }
              }
            }}
            className={`w-full bg-zinc-900 rounded-lg p-6 cursor-pointer transition-all hover:bg-zinc-800`}
          >
            <div className="flex items-center justify-center">
              <h3 className="text-white font-medium text-sm" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>Remove Skin</h3>
            </div>
          </button>
        </div>
      )}
    </>
  );
};
