// Demo: místo nativní mapy zástupná plocha.
const React = require('react');
const { View, Text } = require('react-native');

function MapView(props) {
  return React.createElement(
    View,
    { style: [props.style, { backgroundColor: '#1E1B22', alignItems: 'center', justifyContent: 'center', gap: 8 }] },
    React.createElement(View, { style: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#62E0B5', borderWidth: 3, borderColor: '#121014' } }),
    React.createElement(Text, { style: { color: '#8E8494', fontSize: 12 } }, 'mapa – v aplikaci živá poloha'),
  );
}
module.exports = MapView;
module.exports.default = MapView;
