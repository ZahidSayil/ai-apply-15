import { Routes, Route } from 'react-router-dom'
import Upload from './screens/Upload'
import JobInput from './screens/JobInput'
import Loading from './screens/Loading'
import Results from './screens/Results'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Upload />} />
      <Route path="/job" element={<JobInput />} />
      <Route path="/loading" element={<Loading />} />
      <Route path="/results" element={<Results />} />
    </Routes>
  )
}