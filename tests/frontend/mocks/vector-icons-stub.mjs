// Мок @expo/vector-icons/* для render-тестов: любой импортируемый глиф —
// функциональный компонент-заглушка. FontAwesome5 использует и default, и
// именованные подсемейства (FontAwesome5.Pro и т.п.).
const StubIcon = (props) => ({ $$typeof: 'icon', props });

export default StubIcon;
export const Feather = StubIcon;
export const Ionicons = StubIcon;
export const FontAwesome = StubIcon;
export const FontAwesome5 = StubIcon;
export const MaterialIcons = StubIcon;
export const MaterialCommunityIcons = StubIcon;
export const AntDesign = StubIcon;
export const Entypo = StubIcon;
export const EvilIcons = StubIcon;
export const Foundation = StubIcon;
export const Octicons = StubIcon;
export const SimpleLineIcons = StubIcon;
export const Zocial = StubIcon;
