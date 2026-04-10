import AppActivityDiagrams from './AppActivityDiagrams';
import AppStateDiagrams from './AppStateDiagrams';

function App() {
	const diagramType = document.querySelector('meta[name="diagram-type"]')?.getAttribute('content');
	if (diagramType == 'activity')
		return <AppActivityDiagrams />;
	if (diagramType == 'state')
		return <AppStateDiagrams />;

	return <p>"{diagramType}"" is not a valid diagram type (this should never happen)!</p>
}

export default App;